// Bionic FG Vulkan implicit layer
// Intercepts vkCreateSwapchainKHR + vkQueuePresentKHR to inject generated frames.
// Image sharing between producer device and framegen device is done via AHardwareBuffer.
// Enabled by BIONIC_FG_ENABLE=1 and configured by conf.toml.

#include "../framegen_context.hpp"
#include "../logging.hpp"
#include "../vulkan/vk_types.hpp"

#include <vulkan/vulkan.h>
#ifdef __ANDROID__
#include <android/hardware_buffer.h>
#include <android/log.h>
#include <vulkan/vulkan_android.h>
#endif

#include <algorithm>
#include <cctype>
#include <cerrno>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <memory>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <sys/stat.h>
#include <time.h>
#include <unordered_map>
#include <vector>
#include <thread>
#include <condition_variable>
#include <atomic>
#include <memory>
#include <chrono>

#define BFG_LAYER_NAME "VK_LAYER_BIONIC_framegen"
#ifdef __ANDROID__
#define BFG_LAYER(...) __android_log_print(ANDROID_LOG_INFO, BFG_LAYER_NAME, __VA_ARGS__)
#define BFG_LAYER_E(...) __android_log_print(ANDROID_LOG_ERROR, BFG_LAYER_NAME, __VA_ARGS__)
#else
#include <cstdio>
#define BFG_LAYER(...) do { std::fprintf(stderr, "[BionicFG] " __VA_ARGS__); std::fputc('\n', stderr); } while (0)
#define BFG_LAYER_E(...) do { std::fprintf(stderr, "[BionicFG] ERROR: " __VA_ARGS__); std::fputc('\n', stderr); } while (0)
#endif

#if defined(__GNUC__)
#define BFG_EXPORT __attribute__((visibility("default"), used))
#else
#define BFG_EXPORT
#endif

namespace bfg::layer {

// Minimal loader-link structs normally provided by vulkan/vk_layer.h. The
// Android NDK only ships vulkan_core.h, so define the ABI-compatible subset we
// need for vkCreateInstance/vkCreateDevice trampoline chaining.
typedef enum VkLayerFunction_ {
    VK_LAYER_LINK_INFO = 0,
    VK_LOADER_DATA_CALLBACK = 1,
} VkLayerFunction;

struct VkLayerInstanceLink_ {
    VkLayerInstanceLink_* pNext;
    PFN_vkGetInstanceProcAddr pfnNextGetInstanceProcAddr;
    PFN_vkGetDeviceProcAddr   pfnNextGetDeviceProcAddr;
};
using VkLayerInstanceLink = VkLayerInstanceLink_;

struct VkLayerInstanceCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkLayerFunction function;
    union { VkLayerInstanceLink* pLayerInfo; void* pfnSetInstanceLoaderData; } u;
};
using VkLayerDeviceCreateInfo = VkLayerInstanceCreateInfo;

// ─── Dispatch key helper ──────────────────────────────────────────────────────

static void* dispatchKey(void* h) { return *reinterpret_cast<void**>(h); }

// ─── Config ───────────────────────────────────────────────────────────────────

struct LayerConf {
    bool        enabled         = false;
    int         multiplier      = 2;
    float       flowScale       = 0.6f;
    int         model           = 0;
    bool        fpsLimitEnabled = false;  // whether the base cap below is applied
    int         fpsLimit        = 0;      // remembered base real-frame cap (any positive value; the
                                          // 10-200 range is a frontend convenience, NOT enforced here).
                                          // Paces real frames BEFORE interpolation, so on-screen fps =
                                          // limit × multiplier. conf.toml stays the source of truth, so
                                          // the value is remembered even while the limiter is toggled off.
    bool        deriveSyncTimeout = false;// opt-in: derive the sync-incompatibility timeout from the
                                          // frame budget instead of the fixed fallback (footgun at init,
                                          // so off by default).
    bool        evenPaceGenerated = false;// opt-in: evenly pace generated presents to 1s/(base × mult)
                                          // instead of firing them right after the real frame.
    std::string configPath;
    int64_t     configStamp = 0;

    // Effective base cap actually applied this frame (0 = no cap).
    int effectiveFpsLimit() const { return (fpsLimitEnabled && fpsLimit > 0) ? fpsLimit : 0; }
};

static constexpr int kMaxHotReloadMultiplier = 4;
static constexpr int kMaxHotReloadGeneratedFrames = kMaxHotReloadMultiplier - 1;
// The pipeline's worst case shares this pool: DXVK renders ~3 ahead with an
// unbounded acquire that wins every freed image, the display pipeline holds
// ~3, the deferred pending real holds 1 and up to 3 gen acquires are in
// flight. Only genuine spares beyond all of that keep the drain's bounded
// acquire from starving (observed: 88-96% gen drops at 9 images).
static constexpr uint32_t kHotReloadProvisionedSwapchainImages =
    static_cast<uint32_t>(kMaxHotReloadMultiplier + 8);

static std::string trim(std::string s) {
    auto notSpace = [](unsigned char ch) { return !std::isspace(ch); };
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), notSpace));
    s.erase(std::find_if(s.rbegin(), s.rend(), notSpace).base(), s.end());
    return s;
}

static std::string stripComment(const std::string& line) {
    bool inString = false;
    for (size_t i = 0; i < line.size(); ++i) {
        char ch = line[i];
        if (ch == '"' && (i == 0 || line[i - 1] != '\\')) inString = !inString;
        if (ch == '#' && !inString) return line.substr(0, i);
    }
    return line;
}

static std::string unquote(std::string value) {
    value = trim(value);
    if (value.size() >= 2 && value.front() == '"' && value.back() == '"') {
        value = value.substr(1, value.size() - 2);
        std::string out;
        out.reserve(value.size());
        bool escaped = false;
        for (char ch : value) {
            if (escaped) {
                out.push_back(ch);
                escaped = false;
            } else if (ch == '\\') {
                escaped = true;
            } else {
                out.push_back(ch);
            }
        }
        return out;
    }
    return value;
}

static bool parseBool(std::string value, bool fallback) {
    value = unquote(value);
    std::transform(value.begin(), value.end(), value.begin(),
                   [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
    if (value == "true" || value == "1" || value == "yes" || value == "on") return true;
    if (value == "false" || value == "0" || value == "no" || value == "off") return false;
    return fallback;
}

static int64_t fileStamp(const std::string& path) {
    struct stat st{};
    if (path.empty() || stat(path.c_str(), &st) != 0) return 0;
#if defined(__APPLE__)
    return static_cast<int64_t>(st.st_mtimespec.tv_sec) * 1000000000LL + st.st_mtimespec.tv_nsec;
#else
    return static_cast<int64_t>(st.st_mtim.tv_sec) * 1000000000LL + st.st_mtim.tv_nsec;
#endif
}

static int64_t nowNs() {
    struct timespec ts{};
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return static_cast<int64_t>(ts.tv_sec) * 1000000000LL + ts.tv_nsec;
}

// Sleep until `targetNs` (CLOCK_MONOTONIC). nanosleep is relative, so compute the delta.
static void sleepUntilNs(int64_t targetNs) {
    int64_t delta = targetNs - nowNs();
    if (delta <= 0) return;
    struct timespec req;
    req.tv_sec  = static_cast<time_t>(delta / 1000000000LL);
    req.tv_nsec = static_cast<long>(delta % 1000000000LL);
    // Loop to absorb EINTR.
    while (nanosleep(&req, &req) == -1 && errno == EINTR) {}
}

static std::string defaultConfigPath() {
    if (const char* explicitPath = std::getenv("BIONIC_FG_CONFIG")) {
        if (explicitPath[0] != '\0') return explicitPath;
    }
    if (const char* home = std::getenv("HOME")) {
        if (home[0] != '\0') return std::string(home) + "/.config/bionic-fg/conf.toml";
    }
    return {};
}

static void parseConfigFile(const std::string& path, LayerConf& c) {
    std::ifstream in(path);
    if (!in) return;

    bool sawEnabled = false;
    bool sawFpsEnabled = false;
    std::string line;
    while (std::getline(in, line)) {
        line = trim(stripComment(line));
        if (line.empty() || line.front() == '[') continue;

        size_t eq = line.find('=');
        if (eq == std::string::npos) continue;
        std::string key = trim(line.substr(0, eq));
        std::string value = trim(line.substr(eq + 1));
        std::transform(key.begin(), key.end(), key.begin(),
                       [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });

        try {
            if (key == "enabled") {
                c.enabled = parseBool(value, c.enabled);
                sawEnabled = true;
            } else if (key == "multiplier") {
                c.multiplier = std::max(0, std::min(4, std::atoi(unquote(value).c_str())));
            } else if (key == "flow_scale" || key == "flowscale") {
                c.flowScale = std::max(0.2f, std::min(1.0f, static_cast<float>(std::atof(unquote(value).c_str()))));
            } else if (key == "model") {
                c.model = std::max(0, std::min(1, std::atoi(unquote(value).c_str())));
            } else if (key == "fps_limit" || key == "fpslimit") {
                int v = std::atoi(unquote(value).c_str());
                c.fpsLimit = (v <= 0) ? 0 : v;   // respect any positive value; the UI owns the range
            } else if (key == "fps_limit_enabled" || key == "fpslimitenabled") {
                c.fpsLimitEnabled = parseBool(value, c.fpsLimitEnabled);
                sawFpsEnabled = true;
            } else if (key == "derive_sync_timeout" || key == "derivesynctimeout") {
                c.deriveSyncTimeout = parseBool(value, c.deriveSyncTimeout);
            } else if (key == "even_pace" || key == "evenpace") {
                c.evenPaceGenerated = parseBool(value, c.evenPaceGenerated);
            }
        } catch (...) {
            BFG_LAYER_E("Ignoring invalid config value: %s", line.c_str());
        }
    }

    // Back-compat: a config that sets fps_limit but predates the explicit
    // fps_limit_enabled flag is treated as enabled (a positive fps_limit was
    // the prior "on" signal). Files written by the frontend always emit both.
    if (!sawFpsEnabled) c.fpsLimitEnabled = (c.fpsLimit > 0);

    // If a config exists but omits enabled, keep the launch activation state.
    (void)sawEnabled;
}

static LayerConf readConf() {
    LayerConf c;

    const char* en = std::getenv("BIONIC_FG_ENABLE");
    c.enabled = en && en[0] == '1';

    // Backwards-compatible env fallback. A config file, when present, wins.
    if (auto* v = std::getenv("BIONIC_FG_MULTIPLIER"))
        c.multiplier = std::max(0, std::min(4, std::atoi(v)));
    if (auto* v = std::getenv("BIONIC_FG_FLOW_SCALE"))
        c.flowScale = std::max(0.2f, std::min(1.0f, static_cast<float>(std::atof(v))));
    if (auto* v = std::getenv("BIONIC_FG_MODEL"))
        c.model = std::max(0, std::min(1, std::atoi(v)));
    if (auto* v = std::getenv("BIONIC_FG_FPS_LIMIT")) {
        int iv = std::atoi(v);
        c.fpsLimit = (iv <= 0) ? 0 : iv;        // respect any positive value; UI owns the range
        c.fpsLimitEnabled = (c.fpsLimit > 0);   // env-set positive cap implies enabled
    }

    c.configPath = defaultConfigPath();
    if (!c.configPath.empty()) {
        c.configStamp = fileStamp(c.configPath);
        if (c.configStamp != 0) parseConfigFile(c.configPath, c);
    }
    return c;
}

static bool configNeedsSwapchainRecreate(const LayerConf& oldConf, const LayerConf& newConf) {
    return oldConf.enabled != newConf.enabled;
}

#ifdef __ANDROID__
struct DisableLayerEnvGuard {
    bool hadDisable = false;
    std::string oldDisable;

    DisableLayerEnvGuard() {
        if (const char* v = std::getenv("DISABLE_BIONIC_FG")) {
            hadDisable = true;
            oldDisable = v;
        }
        setenv("DISABLE_BIONIC_FG", "1", 1);
    }

    ~DisableLayerEnvGuard() {
        if (hadDisable) setenv("DISABLE_BIONIC_FG", oldDisable.c_str(), 1);
        else unsetenv("DISABLE_BIONIC_FG");
    }
};
#endif

// ─── Instance data ────────────────────────────────────────────────────────────

struct InstanceData {
    PFN_vkGetInstanceProcAddr  next = nullptr;
    PFN_vkDestroyInstance      destroyInstance = nullptr;
    PFN_vkEnumeratePhysicalDevices enumeratePhysicalDevices = nullptr;
};

// ─── Device data ──────────────────────────────────────────────────────────────

struct DeviceData {
    VkInstance       instance  = VK_NULL_HANDLE;
    VkPhysicalDevice physical  = VK_NULL_HANDLE;
    uint32_t         queueFamilyIdx = 0;
    PFN_vkGetDeviceProcAddr        next                   = nullptr;
    PFN_vkDestroyDevice            destroyDevice          = nullptr;
    PFN_vkCreateSwapchainKHR       createSwapchain        = nullptr;
    PFN_vkDestroySwapchainKHR      destroySwapchain       = nullptr;
    PFN_vkGetSwapchainImagesKHR    getSwapchainImages     = nullptr;
    PFN_vkQueuePresentKHR          queuePresent           = nullptr;
    PFN_vkAcquireNextImageKHR      acquireNextImage       = nullptr;
    PFN_vkWaitForPresentKHR        waitForPresent         = nullptr;
    PFN_vkAcquireNextImage2KHR     acquireNextImage2      = nullptr;
    PFN_vkGetDeviceQueue           getDeviceQueue         = nullptr;
    PFN_vkGetDeviceQueue2          getDeviceQueue2        = nullptr;
    PFN_vkQueueSubmit              queueSubmit            = nullptr;
    PFN_vkDeviceWaitIdle           deviceWaitIdle         = nullptr;
    PFN_vkQueueSubmit2             queueSubmit2           = nullptr;
    PFN_vkQueueSubmit2KHR          queueSubmit2KHR        = nullptr;
    PFN_vkQueueWaitIdle            queueWaitIdle          = nullptr;
    PFN_vkCreateCommandPool        createCmdPool          = nullptr;
    PFN_vkDestroyCommandPool       destroyCmdPool         = nullptr;
    PFN_vkAllocateCommandBuffers   allocCmdBufs           = nullptr;
    PFN_vkResetCommandBuffer       resetCmdBuf            = nullptr;
    PFN_vkBeginCommandBuffer       beginCmdBuf            = nullptr;
    PFN_vkEndCommandBuffer         endCmdBuf              = nullptr;
    PFN_vkCmdPipelineBarrier       cmdPipelineBarrier     = nullptr;
    PFN_vkCmdBlitImage             cmdBlitImage           = nullptr;
    PFN_vkCreateImage              createImage            = nullptr;
    PFN_vkDestroyImage             destroyImage           = nullptr;
    PFN_vkAllocateMemory           allocMemory            = nullptr;
    PFN_vkFreeMemory               freeMemory             = nullptr;
    PFN_vkBindImageMemory          bindImageMemory        = nullptr;
    PFN_vkCreateImageView          createImageView        = nullptr;
    PFN_vkDestroyImageView         destroyImageView       = nullptr;
    PFN_vkCreateFence              createFence            = nullptr;
    PFN_vkDestroyFence             destroyFence           = nullptr;
    PFN_vkWaitForFences            waitForFences          = nullptr;
    PFN_vkResetFences              resetFences            = nullptr;
    PFN_vkCreateSemaphore          createSemaphore        = nullptr;
    PFN_vkDestroySemaphore         destroySemaphore       = nullptr;
    PFN_vkGetPhysicalDeviceMemoryProperties getPhysDevMemProps = nullptr;
#ifdef __ANDROID__
    PFN_vkGetAndroidHardwareBufferPropertiesANDROID getAhbProps = nullptr;
#endif
};

// ─── Swapchain state ──────────────────────────────────────────────────────────

struct SwapState {
    VkDevice   device = VK_NULL_HANDLE;
    // App-device handles for single-device framegen (wrapped, not owned).
    VkInstance       instance     = VK_NULL_HANDLE;
    VkPhysicalDevice physical     = VK_NULL_HANDLE;
    VkQueue          computeQueue = VK_NULL_HANDLE;
    PFN_vkGetPhysicalDeviceMemoryProperties getPhysMemProps = nullptr; // next-layer instance dispatch
    VkExtent2D extent = {};
    VkFormat   format = VK_FORMAT_UNDEFINED;
    std::vector<VkImage> images;
    LayerConf  conf;

#if defined(__ANDROID__) || defined(BFG_GLIBC)
    // Provisioned generated-frame slots the context is (re)built with, so a
    // 2x..4x multiplier hot-reload never needs an app-side swapchain rebuild.
    uint32_t provisionedOutputs = 0;

    std::unique_ptr<bionic_fg::FramegenContext> fgCtx;

    // Copy cmd infrastructure (on producer device)
    VkCommandPool   copyPool   = VK_NULL_HANDLE;
    uint32_t        copyQueueFamily = VK_QUEUE_FAMILY_IGNORED;
    VkCommandBuffer copyCmds[2]= {};
    VkFence         copyFences[2]={};
    VkCommandBuffer genCmds[4] = {};    // one per possible generated frame
    VkFence         genFences[4] = {};
    VkSemaphore     acquireSems[4] = {};
    VkSemaphore     presentSems[4] = {};

    uint64_t frameCount = 0;
    bool     inPresent  = false;
    // Consecutive cross-context fence timeouts, tracked PER fence type so a
    // working copy path can't mask a stuck generated-frame path (or vice versa).
    // Each is reset only when a fence of that same type signals; framegen is
    // disabled once either reaches kMaxFenceTimeouts.
    uint32_t copyFenceTimeouts = 0;
    uint32_t genFenceTimeouts  = 0;
    // Sticky, runtime-only kill switch: once the present-path proves sync-
    // incompatible with this ICD we passthrough for the rest of THIS swapchain's
    // life. Kept separate from conf.enabled (which the file owns) so a conf.toml
    // hot-reload — e.g. nudging the flow slider in-game — can't silently re-arm
    // a path we already gave up on. The clean re-attempt point is a swapchain
    // recreate, which builds a fresh SwapState with this defaulted back to false.
    bool     framegenForceDisabled = false;
    int64_t  lastPresentNs = 0;       // for the fps_limit base-frame pacer (CLOCK_MONOTONIC)
    int64_t  lastRealPresentNs = 0;   // wall-clock of the previous REAL present (cadence EWMA input)
    uint64_t baseIntervalEwmaNs = 0;  // EWMA of delivered real-frame intervals; 0 = no sample yet

    // ── Async present worker ─────────────────────────────────────────────
    // Presents, pacing sleeps and the generated-frame acquire run on this
    // thread so the game's present call returns immediately and never blocks
    // against the display queue. The game thread hands one job per real frame;
    // it waits for the previous job to finish before submitting new GPU work,
    // which both serializes access to the framegen outputs and doubles as the
    // base-rate pacer.
    struct WorkerJob {
        uint32_t imgIdx = 0;
        int      genCount = 0;
        // Gen frames are already blitted (genFences[k] guards completion);
        // the worker only paces and presents them with no wait semaphores —
        // the one cross-thread present shape this wrapper stack tolerates.
        uint32_t genIdx[3] = {};
        uint8_t  genFenceSlot[3] = {};
        int64_t  realDueNs = 0;
        int64_t  outIntervalNs = 0;
        // DXVK throttles via vkWaitForPresentKHR on this id; dropping it from
        // the deferred present stalls the game ~1.5s per frame
        bool     hasPresentId = false;
        uint64_t presentId = 0;
    };
    // One-frame-delayed pipeline: frame N's graph runs on the GPU while the
    // game renders N+1; its gen frames are presented and its REAL present is
    // handed to the worker at the start of call N+1.
    bool     hasPendingReal = false;
    uint32_t pendingImgIdx  = 0;
    int      pendingGen     = 0;
    bool     pendingHasPid  = false;
    uint64_t pendingPid     = 0;
    // Prefetched gen image: freed swapchain images appear at arbitrary points
    // in the frame and DXVK's unbounded acquire wins any it can see, so the
    // gen path grabs one opportunistically whenever it can and holds it for
    // the next drain (signal pending on acquireSems[0] until the blit).
    bool     genHeld = false;
    uint32_t genHeldIdx = 0;
    uint32_t genDrySpell = 0;

    std::thread             workerThread;
    std::mutex              jobMtx;
    std::condition_variable jobCv;
    WorkerJob               job;
    bool                    jobPending = false;
    bool                    jobDone    = true;
    bool                    workerRun  = false;
    DeviceData              ddCopy;
    VkSwapchainKHR          selfHandle = VK_NULL_HANDLE;
    VkCommandPool           workerPool = VK_NULL_HANDLE;
    VkCommandBuffer         workerCmds[4] = {};
    VkFence                 workerFences[4] = {};
    std::atomic<int>        deferredResult{VK_SUCCESS};
    std::atomic<int64_t>    lastWorkerRealNs{0};
    uint64_t                workerRot = 0;

    // Debug telemetry (worker side; logged every ~120 jobs)
    uint64_t wJobs = 0, wGenOk = 0, wGenAcqFail = 0, wGenFenceTimeout = 0,
             wGenSubmitFail = 0, wJobDurNs = 0, wRealPresentErr = 0,
             wGenSalvage = 0, wGenPresentErr = 0, wIdleBeeps = 0,
             wGenGapNs = 0, wGenGapCount = 0;
    int64_t  lastCallNs = 0;
    uint64_t callGapNs = 0, callCount = 0;

    void stopWorker() {
        BFG_LAYER("stopWorker: joinable=%d", (int)workerThread.joinable());
        {
            std::lock_guard<std::mutex> lk(jobMtx);
            workerRun = false;
        }
        jobCv.notify_all();
        if (workerThread.joinable()) workerThread.join();
    }

    // Per-stage wall-clock breakdown of the present path, logged periodically.
    // Every stage is CPU-waited in the current design, so wall time around a
    // stage IS its true cost (copyWait ≈ game GPU tail + blit, graph ≈ full
    // compute graph GPU time).
    uint64_t perfCount = 0;
    uint64_t perfCopySubmitNs = 0, perfCopyWaitNs = 0, perfGraphNs = 0,
             perfGenNs = 0, perfTotalNs = 0;

    void cleanup(const DeviceData& dd, VkDevice dev) {
        BFG_LAYER("cleanup: swapchain state teardown begin");
        stopWorker();
        if (dd.deviceWaitIdle) dd.deviceWaitIdle(dev);
        if (workerPool) { dd.destroyCmdPool(dev, workerPool, nullptr); workerPool = VK_NULL_HANDLE; }
        for (auto& f : workerFences) if (f) { dd.destroyFence(dev, f, nullptr); f = VK_NULL_HANDLE; }
        for (auto& s : acquireSems) if (s) { dd.destroySemaphore(dev, s, nullptr); s = VK_NULL_HANDLE; }
        for (auto& s : presentSems) if (s) { dd.destroySemaphore(dev, s, nullptr); s = VK_NULL_HANDLE; }
        for (auto& f : copyFences) if (f) { dd.destroyFence(dev, f, nullptr); f = VK_NULL_HANDLE; }
        for (auto& f : genFences) if (f) { dd.destroyFence(dev, f, nullptr); f = VK_NULL_HANDLE; }
        if (copyPool) dd.destroyCmdPool(dev, copyPool, nullptr);
        // Destroy framegen context (owns the frame input/output images)
        if (fgCtx) { fgCtx->destroy(); fgCtx.reset(); }
        copyPool = VK_NULL_HANDLE;
        copyQueueFamily = VK_QUEUE_FAMILY_IGNORED;
    }
#endif
};

static bionic_fg::Config makeFramegenConfig(const SwapState& st, const LayerConf& conf) {
    bionic_fg::Config cfg;
    cfg.width = st.extent.width;
    cfg.height = st.extent.height;
    cfg.multiplier = static_cast<uint32_t>(std::max(2, std::min(kMaxHotReloadMultiplier, conf.multiplier)));
    cfg.flowScale = conf.flowScale;
    cfg.model = static_cast<uint32_t>(std::max(0, std::min(1, conf.model)));
    return cfg;
}

#if defined(__ANDROID__) || defined(BFG_GLIBC)
static std::unique_ptr<bionic_fg::FramegenContext> createFramegenContext(
        const SwapState& st,
        const LayerConf& conf) {
#ifdef __ANDROID__
    DisableLayerEnvGuard disableLayerForInternalVulkan;
#endif
    // Wrap the application's own device (not owned) so interpolation runs on the
    // same device as the swapchain — single-device mode with context-owned
    // device-local frame images (no AHB round-trip).
    bionic_fg::vk::Device appDevice = bionic_fg::vk::Device::wrap(
        st.instance, st.physical, st.device, st.copyQueueFamily, st.computeQueue,
        st.getPhysMemProps);
    // Frame images stay RGBA8 regardless of the swapchain format (matching the
    // old AHB memory format); the swapchain blits convert at the boundary.
    // BGRA8 storage images are not universally supported, so the swapchain
    // format must not leak into the compute graph.
    return bionic_fg::FramegenContext::create(
        appDevice,
        st.provisionedOutputs,
        st.extent,
        VK_FORMAT_R8G8B8A8_UNORM,
        makeFramegenConfig(st, conf));
}

static bool rebuildFramegenContext(SwapState& st, const LayerConf& conf) {
    if (st.provisionedOutputs == 0) {
        BFG_LAYER_E("cannot rebuild FramegenContext: swapchain state not provisioned");
        return false;
    }

    if (st.fgCtx) st.fgCtx->waitIdle();

    auto newCtx = createFramegenContext(st, conf);
    if (!newCtx) {
        BFG_LAYER_E("FramegenContext rebuild failed for mult=%d flow=%.2f model=%d",
                    conf.multiplier, conf.flowScale, conf.model);
        return false;
    }

    if (st.fgCtx) {
        st.fgCtx->destroy();
    }
    st.fgCtx = std::move(newCtx);
    BFG_LAYER("FramegenContext rebuilt: mult=%d flow=%.2f model=%d",
              conf.multiplier, conf.flowScale, conf.model);
    return true;
}
#endif

// ─── Global state ─────────────────────────────────────────────────────────────

static std::mutex g_mtx;
// Serializes every queue operation (app submits via the hooks below, layer
// submits, worker submits/presents): Vulkan queues require external sync and
// the present worker runs off the game thread.
static std::mutex g_queueSubmitMtx;
struct SwapState;
static void presentWorkerLoop(SwapState* st);
static std::unordered_map<void*, InstanceData> g_instances;
static std::unordered_map<void*, DeviceData>   g_devices;
static std::unordered_map<VkPhysicalDevice, VkInstance> g_physInstances;
struct QueueData { void* deviceKey = nullptr; uint32_t family = VK_QUEUE_FAMILY_IGNORED; };
static std::unordered_map<VkQueue, QueueData> g_queues;
static std::unordered_map<VkSwapchainKHR, std::unique_ptr<SwapState>> g_swapchains;
static std::unordered_map<VkSwapchainKHR, void*>     g_swapDevice;
// Retired SwapStates are kept alive until vkDestroyDevice: a game thread can
// still be parked on a state's jobMtx/jobCv when its swapchain is retired, and
// destroying the mutex under it is a FORTIFY abort. cleanup() has already freed
// the Vulkan resources and nulled fgCtx, so latecomer presents pass through.
static std::vector<std::unique_ptr<SwapState>> g_retiredSwapStates;

// ─── Barrier helper ───────────────────────────────────────────────────────────

static void layerImageBarrier(const DeviceData& dd, VkCommandBuffer cmd,
        VkImage img,
        VkPipelineStageFlags srcStage, VkAccessFlags srcAccess,
        VkPipelineStageFlags dstStage, VkAccessFlags dstAccess,
        VkImageLayout oldLayout, VkImageLayout newLayout,
        uint32_t srcQueueFamily = VK_QUEUE_FAMILY_IGNORED,
        uint32_t dstQueueFamily = VK_QUEUE_FAMILY_IGNORED) {
    VkImageMemoryBarrier b{};
    b.sType               = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
    b.srcAccessMask       = srcAccess;
    b.dstAccessMask       = dstAccess;
    b.oldLayout           = oldLayout;
    b.newLayout           = newLayout;
    b.srcQueueFamilyIndex = srcQueueFamily;
    b.dstQueueFamilyIndex = dstQueueFamily;
    b.image               = img;
    b.subresourceRange    = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    dd.cmdPipelineBarrier(cmd, srcStage, dstStage, 0, 0, nullptr, 0, nullptr, 1, &b);
}

// ─── CreateInstance ───────────────────────────────────────────────────────────

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_CreateInstance(
        const VkInstanceCreateInfo* pCreateInfo,
        const VkAllocationCallbacks* pAllocator,
        VkInstance* pInstance) {
    // Walk pNext for the layer link info
    auto* linkInfo = reinterpret_cast<const VkLayerInstanceCreateInfo*>(pCreateInfo->pNext);
    while (linkInfo && !(linkInfo->sType == VK_STRUCTURE_TYPE_LOADER_INSTANCE_CREATE_INFO
                         && linkInfo->function == VK_LAYER_LINK_INFO)) {
        linkInfo = reinterpret_cast<const VkLayerInstanceCreateInfo*>(linkInfo->pNext);
    }
    if (!linkInfo) return VK_ERROR_INITIALIZATION_FAILED;

    PFN_vkGetInstanceProcAddr nextGIPA = linkInfo->u.pLayerInfo->pfnNextGetInstanceProcAddr;
    // advance layer link
    const_cast<VkLayerInstanceCreateInfo*>(linkInfo)->u.pLayerInfo =
        linkInfo->u.pLayerInfo->pNext;

    auto* createInstance = reinterpret_cast<PFN_vkCreateInstance>(
        nextGIPA(VK_NULL_HANDLE, "vkCreateInstance"));
    if (!createInstance) return VK_ERROR_INITIALIZATION_FAILED;

    VkResult res = createInstance(pCreateInfo, pAllocator, pInstance);
    if (res != VK_SUCCESS) return res;

    InstanceData data;
    data.next            = nextGIPA;
    data.destroyInstance = reinterpret_cast<PFN_vkDestroyInstance>(
        nextGIPA(*pInstance, "vkDestroyInstance"));
    data.enumeratePhysicalDevices = reinterpret_cast<PFN_vkEnumeratePhysicalDevices>(
        nextGIPA(*pInstance, "vkEnumeratePhysicalDevices"));
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_instances[dispatchKey(*pInstance)] = data;
    }
    return VK_SUCCESS;
}

VKAPI_ATTR void VKAPI_CALL BionicFG_DestroyInstance(
        VkInstance instance, const VkAllocationCallbacks* pAllocator) {
    std::lock_guard<std::mutex> lk(g_mtx);
    auto it = g_instances.find(dispatchKey(instance));
    if (it != g_instances.end()) {
        for (auto pit = g_physInstances.begin(); pit != g_physInstances.end(); ) {
            pit = (pit->second == instance) ? g_physInstances.erase(pit) : std::next(pit);
        }
        it->second.destroyInstance(instance, pAllocator);
        g_instances.erase(it);
    }
}

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_EnumeratePhysicalDevices(
        VkInstance instance, uint32_t* pPhysicalDeviceCount,
        VkPhysicalDevice* pPhysicalDevices) {
    InstanceData id;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_instances.find(dispatchKey(instance));
        if (it == g_instances.end() || !it->second.enumeratePhysicalDevices)
            return VK_ERROR_INITIALIZATION_FAILED;
        id = it->second;
    }
    VkResult res = id.enumeratePhysicalDevices(instance, pPhysicalDeviceCount, pPhysicalDevices);
    if ((res == VK_SUCCESS || res == VK_INCOMPLETE) && pPhysicalDevices && pPhysicalDeviceCount) {
        std::lock_guard<std::mutex> lk(g_mtx);
        for (uint32_t i = 0; i < *pPhysicalDeviceCount; ++i)
            g_physInstances[pPhysicalDevices[i]] = instance;
    }
    return res;
}

// ─── CreateDevice ─────────────────────────────────────────────────────────────

#ifdef __ANDROID__
static const char* kAhbExts[] = {
    "VK_ANDROID_external_memory_android_hardware_buffer",
    "VK_KHR_external_memory",
    "VK_KHR_sampler_ycbcr_conversion",
    "VK_KHR_dedicated_allocation",
    "VK_KHR_get_memory_requirements2",
    "VK_KHR_bind_memory2",
    "VK_KHR_maintenance1",
};
#endif

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_CreateDevice(
        VkPhysicalDevice physicalDevice,
        const VkDeviceCreateInfo* pCreateInfo,
        const VkAllocationCallbacks* pAllocator,
        VkDevice* pDevice) {
    auto* linkInfo = reinterpret_cast<const VkLayerDeviceCreateInfo*>(pCreateInfo->pNext);
    while (linkInfo && !(linkInfo->sType == VK_STRUCTURE_TYPE_LOADER_DEVICE_CREATE_INFO
                         && linkInfo->function == VK_LAYER_LINK_INFO)) {
        linkInfo = reinterpret_cast<const VkLayerDeviceCreateInfo*>(linkInfo->pNext);
    }
    if (!linkInfo) return VK_ERROR_INITIALIZATION_FAILED;

    PFN_vkGetInstanceProcAddr nextGIPA = linkInfo->u.pLayerInfo->pfnNextGetInstanceProcAddr;
    PFN_vkGetDeviceProcAddr   nextGDPA = linkInfo->u.pLayerInfo->pfnNextGetDeviceProcAddr;
    const_cast<VkLayerDeviceCreateInfo*>(linkInfo)->u.pLayerInfo =
        linkInfo->u.pLayerInfo->pNext;

    VkDeviceCreateInfo dci = *pCreateInfo;
#ifdef __ANDROID__
    // Inject AHB extensions if not present (needed for cross-device sharing).
    std::vector<const char*> exts(
        pCreateInfo->ppEnabledExtensionNames,
        pCreateInfo->ppEnabledExtensionNames + pCreateInfo->enabledExtensionCount);
    for (const char* e : kAhbExts) {
        bool found = false;
        for (const char* x : exts) if (std::strcmp(x, e) == 0) { found = true; break; }
        if (!found) exts.push_back(e);
    }
    dci.enabledExtensionCount   = static_cast<uint32_t>(exts.size());
    dci.ppEnabledExtensionNames = exts.data();
#endif

    // Look up the real instance that produced this physical device.
    VkInstance instance = VK_NULL_HANDLE;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto pit = g_physInstances.find(physicalDevice);
        if (pit != g_physInstances.end()) instance = pit->second;
    }

    auto* createDevice = reinterpret_cast<PFN_vkCreateDevice>(
        nextGIPA(instance, "vkCreateDevice"));
    if (!createDevice) return VK_ERROR_INITIALIZATION_FAILED;

    VkResult res = createDevice(physicalDevice, &dci, pAllocator, pDevice);
    if (res != VK_SUCCESS) return res;

    // Find compute/graphics queue family through the next instance dispatch.
    // Calling the global loader symbol from inside a layer can reject wrapped
    // physical-device handles as invalid.
    auto* getQueueFamilyProps = reinterpret_cast<PFN_vkGetPhysicalDeviceQueueFamilyProperties>(
        nextGIPA(instance, "vkGetPhysicalDeviceQueueFamilyProperties"));
    if (!getQueueFamilyProps) return VK_ERROR_INITIALIZATION_FAILED;
    uint32_t qfCount = 0;
    getQueueFamilyProps(physicalDevice, &qfCount, nullptr);
    std::vector<VkQueueFamilyProperties> qfProps(qfCount);
    getQueueFamilyProps(physicalDevice, &qfCount, qfProps.data());
    uint32_t qf = 0;
    for (uint32_t i = 0; i < qfCount; ++i) {
        if (qfProps[i].queueFlags & (VK_QUEUE_GRAPHICS_BIT | VK_QUEUE_COMPUTE_BIT)) {
            qf = i; break;
        }
    }

    auto load = [&](const char* name) {
        return reinterpret_cast<PFN_vkVoidFunction>(nextGDPA(*pDevice, name));
    };

    DeviceData dd;
    dd.instance       = instance;
    dd.physical       = physicalDevice;
    dd.queueFamilyIdx = qf;
    dd.next                 = nextGDPA;
    dd.destroyDevice        = reinterpret_cast<PFN_vkDestroyDevice>(load("vkDestroyDevice"));
    dd.createSwapchain      = reinterpret_cast<PFN_vkCreateSwapchainKHR>(load("vkCreateSwapchainKHR"));
    dd.destroySwapchain     = reinterpret_cast<PFN_vkDestroySwapchainKHR>(load("vkDestroySwapchainKHR"));
    dd.getSwapchainImages   = reinterpret_cast<PFN_vkGetSwapchainImagesKHR>(load("vkGetSwapchainImagesKHR"));
    dd.queuePresent         = reinterpret_cast<PFN_vkQueuePresentKHR>(load("vkQueuePresentKHR"));
    dd.acquireNextImage     = reinterpret_cast<PFN_vkAcquireNextImageKHR>(load("vkAcquireNextImageKHR"));
    dd.waitForPresent       = reinterpret_cast<PFN_vkWaitForPresentKHR>(load("vkWaitForPresentKHR"));
    dd.acquireNextImage2    = reinterpret_cast<PFN_vkAcquireNextImage2KHR>(load("vkAcquireNextImage2KHR"));
    dd.getDeviceQueue       = reinterpret_cast<PFN_vkGetDeviceQueue>(load("vkGetDeviceQueue"));
    dd.getDeviceQueue2      = reinterpret_cast<PFN_vkGetDeviceQueue2>(load("vkGetDeviceQueue2"));
    dd.queueSubmit          = reinterpret_cast<PFN_vkQueueSubmit>(load("vkQueueSubmit"));
    dd.deviceWaitIdle       = reinterpret_cast<PFN_vkDeviceWaitIdle>(load("vkDeviceWaitIdle"));
    dd.queueSubmit2         = reinterpret_cast<PFN_vkQueueSubmit2>(load("vkQueueSubmit2"));
    dd.queueSubmit2KHR      = reinterpret_cast<PFN_vkQueueSubmit2KHR>(load("vkQueueSubmit2KHR"));
    dd.queueWaitIdle        = reinterpret_cast<PFN_vkQueueWaitIdle>(load("vkQueueWaitIdle"));
    dd.createCmdPool        = reinterpret_cast<PFN_vkCreateCommandPool>(load("vkCreateCommandPool"));
    dd.destroyCmdPool       = reinterpret_cast<PFN_vkDestroyCommandPool>(load("vkDestroyCommandPool"));
    dd.allocCmdBufs         = reinterpret_cast<PFN_vkAllocateCommandBuffers>(load("vkAllocateCommandBuffers"));
    dd.resetCmdBuf          = reinterpret_cast<PFN_vkResetCommandBuffer>(load("vkResetCommandBuffer"));
    dd.beginCmdBuf          = reinterpret_cast<PFN_vkBeginCommandBuffer>(load("vkBeginCommandBuffer"));
    dd.endCmdBuf            = reinterpret_cast<PFN_vkEndCommandBuffer>(load("vkEndCommandBuffer"));
    dd.cmdPipelineBarrier   = reinterpret_cast<PFN_vkCmdPipelineBarrier>(load("vkCmdPipelineBarrier"));
    dd.cmdBlitImage         = reinterpret_cast<PFN_vkCmdBlitImage>(load("vkCmdBlitImage"));
    dd.createImage          = reinterpret_cast<PFN_vkCreateImage>(load("vkCreateImage"));
    dd.destroyImage         = reinterpret_cast<PFN_vkDestroyImage>(load("vkDestroyImage"));
    dd.allocMemory          = reinterpret_cast<PFN_vkAllocateMemory>(load("vkAllocateMemory"));
    dd.freeMemory           = reinterpret_cast<PFN_vkFreeMemory>(load("vkFreeMemory"));
    dd.bindImageMemory      = reinterpret_cast<PFN_vkBindImageMemory>(load("vkBindImageMemory"));
    dd.createImageView      = reinterpret_cast<PFN_vkCreateImageView>(load("vkCreateImageView"));
    dd.destroyImageView     = reinterpret_cast<PFN_vkDestroyImageView>(load("vkDestroyImageView"));
    dd.createFence          = reinterpret_cast<PFN_vkCreateFence>(load("vkCreateFence"));
    dd.destroyFence         = reinterpret_cast<PFN_vkDestroyFence>(load("vkDestroyFence"));
    dd.waitForFences        = reinterpret_cast<PFN_vkWaitForFences>(load("vkWaitForFences"));
    dd.resetFences          = reinterpret_cast<PFN_vkResetFences>(load("vkResetFences"));
    dd.createSemaphore      = reinterpret_cast<PFN_vkCreateSemaphore>(load("vkCreateSemaphore"));
    dd.destroySemaphore     = reinterpret_cast<PFN_vkDestroySemaphore>(load("vkDestroySemaphore"));
    dd.getPhysDevMemProps   = reinterpret_cast<PFN_vkGetPhysicalDeviceMemoryProperties>(
        nextGIPA(instance, "vkGetPhysicalDeviceMemoryProperties"));
#ifdef __ANDROID__
    dd.getAhbProps = reinterpret_cast<PFN_vkGetAndroidHardwareBufferPropertiesANDROID>(
        load("vkGetAndroidHardwareBufferPropertiesANDROID"));
#endif
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_devices[dispatchKey(*pDevice)] = dd;
        // Pre-register every queue so the QueueSubmit hooks can always
        // resolve the device, regardless of how the app fetched its queues
        if (dd.getDeviceQueue) {
            for (uint32_t qi = 0; qi < pCreateInfo->queueCreateInfoCount; ++qi) {
                const auto& qci = pCreateInfo->pQueueCreateInfos[qi];
                for (uint32_t q = 0; q < qci.queueCount; ++q) {
                    VkQueue qh = VK_NULL_HANDLE;
                    dd.getDeviceQueue(*pDevice, qci.queueFamilyIndex, q, &qh);
                    if (qh) g_queues[qh] = QueueData{dispatchKey(*pDevice), qci.queueFamilyIndex};
                }
            }
        }
    }
    BFG_LAYER("Device created, queueFamily=%u", qf);
    return VK_SUCCESS;
}

VKAPI_ATTR void VKAPI_CALL BionicFG_DestroyDevice(
        VkDevice device, const VkAllocationCallbacks* pAllocator) {
    std::lock_guard<std::mutex> lk(g_mtx);
    void* devKey = dispatchKey(device);
    for (auto itq = g_queues.begin(); itq != g_queues.end(); ) {
        itq = (itq->second.deviceKey == devKey) ? g_queues.erase(itq) : std::next(itq);
    }
    for (auto itr = g_retiredSwapStates.begin(); itr != g_retiredSwapStates.end(); ) {
        itr = (dispatchKey((*itr)->device) == devKey) ? g_retiredSwapStates.erase(itr) : std::next(itr);
    }
    auto it = g_devices.find(devKey);
    if (it != g_devices.end()) {
        it->second.destroyDevice(device, pAllocator);
        g_devices.erase(it);
    }
}

VKAPI_ATTR void VKAPI_CALL BionicFG_GetDeviceQueue(
        VkDevice device, uint32_t queueFamilyIndex, uint32_t queueIndex,
        VkQueue* pQueue) {
    DeviceData dd;
    void* devKey = dispatchKey(device);
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_devices.find(devKey);
        if (it == g_devices.end() || !it->second.getDeviceQueue) return;
        dd = it->second;
    }
    dd.getDeviceQueue(device, queueFamilyIndex, queueIndex, pQueue);
    if (pQueue && *pQueue) {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_queues[*pQueue] = QueueData{devKey, queueFamilyIndex};
    }
}

VKAPI_ATTR void VKAPI_CALL BionicFG_GetDeviceQueue2(
        VkDevice device, const VkDeviceQueueInfo2* pQueueInfo, VkQueue* pQueue) {
    DeviceData dd;
    void* devKey = dispatchKey(device);
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_devices.find(devKey);
        if (it == g_devices.end() || !it->second.getDeviceQueue2) return;
        dd = it->second;
    }
    dd.getDeviceQueue2(device, pQueueInfo, pQueue);
    if (pQueueInfo && pQueue && *pQueue) {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_queues[*pQueue] = QueueData{devKey, pQueueInfo->queueFamilyIndex};
    }
}

// Swapchain acquire/present require external synchronization; the present
// worker acquires and presents off-thread, so every acquire (the app's
// included) must hold the same lock the presents hold. A blocking acquire
// must not hold it while waiting — poll with zero timeout and release the
// lock between tries so the worker's frame-freeing presents can proceed.
static VkResult lockedPollAcquire(const DeviceData& dd, VkDevice device,
                                  VkSwapchainKHR swapchain, uint64_t timeoutNs,
                                  VkSemaphore semaphore, VkFence fence,
                                  uint32_t* pImageIndex) {
    if (!dd.acquireNextImage) return VK_ERROR_EXTENSION_NOT_PRESENT;
    const int64_t start = nowNs();
    uint64_t spins = 0;
    for (;;) {
        VkResult r;
        {
            std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
            r = dd.acquireNextImage(device, swapchain, 0, semaphore, fence, pImageIndex);
        }
        if (r != VK_NOT_READY && r != VK_TIMEOUT) return r;
        if (++spins == 400)
            BFG_LAYER_E("acquire poll spinning >400ms without a free image (timeout=%llu)",
                        (unsigned long long)timeoutNs);
        const uint64_t elapsed = (uint64_t)(nowNs() - start);
        if (timeoutNs == 0) return VK_NOT_READY;
        if (timeoutNs != UINT64_MAX && elapsed >= timeoutNs) return VK_TIMEOUT;
        struct timespec ts{0, 1000000};
        nanosleep(&ts, nullptr);
    }
}

static std::atomic<uint64_t> g_acqTraceCount{0};
static std::atomic<uint64_t> g_waitPresentTraceCount{0};
static std::atomic<uint64_t> g_appAcqWaitNs{0};
static std::atomic<uint64_t> g_appAcqWaitCnt{0};

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_AcquireNextImageKHR(
        VkDevice device, VkSwapchainKHR swapchain, uint64_t timeout,
        VkSemaphore semaphore, VkFence fence, uint32_t* pImageIndex) {
    DeviceData dd;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_devices.find(dispatchKey(device));
        if (it == g_devices.end() || !it->second.acquireNextImage)
            return VK_ERROR_EXTENSION_NOT_PRESENT;
        dd = it->second;
    }
    const uint64_t n = g_acqTraceCount.fetch_add(1);
    const int64_t t0 = nowNs();
    VkResult r = lockedPollAcquire(dd, device, swapchain, timeout, semaphore, fence, pImageIndex);
    g_appAcqWaitNs.fetch_add((uint64_t)(nowNs() - t0));
    g_appAcqWaitCnt.fetch_add(1);
    if (n < 12)
        BFG_LAYER("app acquire[%llu]: res=%d idx=%u timeout=%llu",
                  (unsigned long long)n, r, pImageIndex ? *pImageIndex : UINT32_MAX,
                  (unsigned long long)timeout);
    return r;
}

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_WaitForPresentKHR(
        VkDevice device, VkSwapchainKHR swapchain, uint64_t presentId, uint64_t timeout) {
    DeviceData dd;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_devices.find(dispatchKey(device));
        if (it == g_devices.end() || !it->second.waitForPresent)
            return VK_ERROR_EXTENSION_NOT_PRESENT;
        dd = it->second;
    }
    const uint64_t n = g_waitPresentTraceCount.fetch_add(1);
    if (n < 12)
        BFG_LAYER("app waitForPresent[%llu]: enter id=%llu timeout=%llu",
                  (unsigned long long)n, (unsigned long long)presentId,
                  (unsigned long long)timeout);
    const int64_t t0 = nowNs();
    VkResult r = dd.waitForPresent(device, swapchain, presentId, timeout);
    const double ms = (nowNs() - t0) / 1e6;
    if (n < 12 || ms > 1000.0)
        BFG_LAYER("app waitForPresent[%llu]: id=%llu res=%d took=%.2fms timeout=%llu",
                  (unsigned long long)n, (unsigned long long)presentId, r, ms,
                  (unsigned long long)timeout);
    return r;
}

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_AcquireNextImage2KHR(
        VkDevice device, const VkAcquireNextImageInfoKHR* pAcquireInfo,
        uint32_t* pImageIndex) {
    DeviceData dd;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_devices.find(dispatchKey(device));
        if (it == g_devices.end() || !it->second.acquireNextImage)
            return VK_ERROR_EXTENSION_NOT_PRESENT;
        dd = it->second;
    }
    if (!pAcquireInfo) return VK_ERROR_INITIALIZATION_FAILED;
    return lockedPollAcquire(dd, device, pAcquireInfo->swapchain, pAcquireInfo->timeout,
                             pAcquireInfo->semaphore, pAcquireInfo->fence, pImageIndex);
}

// ─── CreateSwapchainKHR ───────────────────────────────────────────────────────

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_CreateSwapchainKHR(
        VkDevice device,
        const VkSwapchainCreateInfoKHR* pCreateInfo,
        const VkAllocationCallbacks* pAllocator,
        VkSwapchainKHR* pSwapchain) {
    LayerConf conf = readConf();
    BFG_LAYER("CreateSwapchainKHR enter: old=%p mode=%d minImages=%u %ux%u",
              (void*)pCreateInfo->oldSwapchain, pCreateInfo->presentMode,
              pCreateInfo->minImageCount, pCreateInfo->imageExtent.width,
              pCreateInfo->imageExtent.height);

    DeviceData dd;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_devices.find(dispatchKey(device));
        if (it == g_devices.end()) return VK_ERROR_INITIALIZATION_FAILED;
        dd = it->second;
    }

    // Modify swapchain: add transfer usage, request enough images up front for
    // full 2x..4x hot-reload without requiring a swapchain recreation later.
    VkSwapchainCreateInfoKHR ci = *pCreateInfo;
    ci.imageUsage |= VK_IMAGE_USAGE_TRANSFER_SRC_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
    if (conf.enabled) {
        ci.minImageCount = std::max(ci.minImageCount, kHotReloadProvisionedSwapchainImages);
        // FIFO makes the swapchain bistable for frame injection: releases only
        // happen at display latches, so release rate == present rate and once
        // a single gen frame drops, every release is consumed by the app's own
        // acquire forever (measured: app acquire 3.3ms avg, 95% gen drops, and
        // image count 7/9/12 changes nothing). MAILBOX releases the replaced
        // image immediately — no bistability — and with midpoint-paced worker
        // presents each frame still gets its own 120Hz vsync; when base dips,
        // mailbox drops the GEN frame and keeps the real one, which is the
        // right degradation for framegen.
        if (ci.presentMode == VK_PRESENT_MODE_FIFO_KHR ||
            ci.presentMode == VK_PRESENT_MODE_FIFO_RELAXED_KHR) {
            BFG_LAYER("forcing presentMode MAILBOX (was %d)", ci.presentMode);
            ci.presentMode = VK_PRESENT_MODE_MAILBOX_KHR;
        }
    }

    // Retire old swapchain state if recreating. cleanup() must run OUTSIDE
    // g_mtx: destroying the FramegenContext re-enters the layer chain (its
    // internal queue submit/wait-idle hit our hooks, which lock g_mtx) and a
    // held g_mtx self-deadlocks the create call.
    if (pCreateInfo->oldSwapchain) {
        std::unique_ptr<SwapState> retired;
        {
            std::lock_guard<std::mutex> lk(g_mtx);
            auto old = g_swapchains.find(pCreateInfo->oldSwapchain);
            if (old != g_swapchains.end()) {
                retired = std::move(old->second);
                g_swapchains.erase(old);
            }
            g_swapDevice.erase(pCreateInfo->oldSwapchain);
        }
        if (retired) {
            retired->cleanup(dd, retired->device);
            std::lock_guard<std::mutex> lk(g_mtx);
            g_retiredSwapStates.push_back(std::move(retired));
        }
    }

    VkResult res = dd.createSwapchain(device, &ci, pAllocator, pSwapchain);
    if (res != VK_SUCCESS &&
        (ci.minImageCount != pCreateInfo->minImageCount || ci.presentMode != pCreateInfo->presentMode)) {
        BFG_LAYER_E("swapchain create with %u images mode %d failed (%d); retrying with app's %u/%d",
                    ci.minImageCount, ci.presentMode, res,
                    pCreateInfo->minImageCount, pCreateInfo->presentMode);
        ci.minImageCount = pCreateInfo->minImageCount;
        ci.presentMode   = pCreateInfo->presentMode;
        res = dd.createSwapchain(device, &ci, pAllocator, pSwapchain);
    }
    if (res != VK_SUCCESS) return res;

    // Get swapchain images
    uint32_t imgCount = 0;
    dd.getSwapchainImages(device, *pSwapchain, &imgCount, nullptr);
    std::vector<VkImage> imgs(imgCount);
    dd.getSwapchainImages(device, *pSwapchain, &imgCount, imgs.data());

    {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_swapDevice[*pSwapchain] = dispatchKey(device);
    }

    if (!conf.enabled) {
        BFG_LAYER("Layer disabled (BIONIC_FG_ENABLE not set)");
        std::lock_guard<std::mutex> lk(g_mtx);
        auto stPtr = std::make_unique<SwapState>();
        stPtr->device = device; stPtr->extent = ci.imageExtent;
        stPtr->format = ci.imageFormat; stPtr->images = imgs; stPtr->conf = conf;
        g_swapchains[*pSwapchain] = std::move(stPtr);
        return VK_SUCCESS;
    }

#if defined(__ANDROID__) || defined(BFG_GLIBC)
    auto stHolder = std::make_unique<SwapState>();
    SwapState& st = *stHolder;
    st.device = device;
    st.extent = ci.imageExtent;
    st.format = ci.imageFormat;
    st.images = imgs;
    st.conf   = conf;

    try {
        const uint32_t W = ci.imageExtent.width, H = ci.imageExtent.height;
        const int requestedGeneratedFrames = std::max(conf.multiplier - 1, 0);
        const int provisionedGeneratedFrames = kMaxHotReloadGeneratedFrames;
        st.provisionedOutputs = static_cast<uint32_t>(provisionedGeneratedFrames);

        // Create copy command pool
        VkCommandPoolCreateInfo cpci{};
        cpci.sType            = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
        cpci.queueFamilyIndex = dd.queueFamilyIdx;
        st.copyQueueFamily    = dd.queueFamilyIdx;
        cpci.flags            = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
        dd.createCmdPool(device, &cpci, nullptr, &st.copyPool);

        // App-device handles for single-device framegen. Reuse the same queue the
        // copy path submits to (the present/graphics queue) so all framegen work
        // is ordered on one queue from the present thread.
        st.instance = dd.instance;
        st.physical = dd.physical;
        st.getPhysMemProps = dd.getPhysDevMemProps; // route phys-dev queries via layer dispatch
        if (dd.getDeviceQueue)
            dd.getDeviceQueue(device, dd.queueFamilyIdx, 0, &st.computeQueue);

        VkCommandBufferAllocateInfo cbai{};
        cbai.sType              = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
        cbai.commandPool        = st.copyPool;
        cbai.level              = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        cbai.commandBufferCount = 2;
        if (dd.allocCmdBufs(device, &cbai, st.copyCmds) != VK_SUCCESS)
            throw std::runtime_error("failed to allocate copy command buffers");
        cbai.commandBufferCount = kMaxHotReloadGeneratedFrames;
        if (dd.allocCmdBufs(device, &cbai, st.genCmds) != VK_SUCCESS)
            throw std::runtime_error("failed to allocate generated-frame command buffers");

        VkFenceCreateInfo fci{};
        fci.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
        fci.flags = VK_FENCE_CREATE_SIGNALED_BIT;
        if (dd.createFence(device, &fci, nullptr, &st.copyFences[0]) != VK_SUCCESS ||
            dd.createFence(device, &fci, nullptr, &st.copyFences[1]) != VK_SUCCESS)
            throw std::runtime_error("failed to create copy fences");
        for (int k = 0; k < kMaxHotReloadGeneratedFrames && k < 4; ++k) {
            if (dd.createFence(device, &fci, nullptr, &st.genFences[k]) != VK_SUCCESS)
                throw std::runtime_error("failed to create generated-frame fence");
        }

        VkSemaphoreCreateInfo sci{};
        sci.sType = VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO;
        for (int k = 0; k < kMaxHotReloadGeneratedFrames && k < 4; ++k) {
            if (dd.createSemaphore(device, &sci, nullptr, &st.acquireSems[k]) != VK_SUCCESS ||
                dd.createSemaphore(device, &sci, nullptr, &st.presentSems[k]) != VK_SUCCESS)
                throw std::runtime_error("failed to create generated-frame semaphores");
        }

        // Create FramegenContext only when generation is currently active.
        // The swapchain/AHB set is still provisioned for full 2x..4x hot-reload,
        // so turning framegen on later does not require app-side swapchain rebuilds.
        if (requestedGeneratedFrames > 0) {
            st.fgCtx = createFramegenContext(st, conf);
            if (!st.fgCtx) {
                BFG_LAYER_E("FramegenContext creation failed — layer will passthrough");
            } else {
                BFG_LAYER("SwapchainState ready: %ux%u mult=%d provisionedOutputs=%d shaders=embedded",
                          W, H, requestedGeneratedFrames + 1, provisionedGeneratedFrames);
            }
        } else {
            BFG_LAYER("SwapchainState provisioned: %ux%u framegen=off provisionedOutputs=%d",
                      W, H, provisionedGeneratedFrames);
        }
        st.ddCopy = dd;
        st.selfHandle = *pSwapchain;
        VkCommandPoolCreateInfo wpci{};
        wpci.sType            = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
        wpci.queueFamilyIndex = dd.queueFamilyIdx;
        wpci.flags            = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
        if (dd.createCmdPool(device, &wpci, nullptr, &st.workerPool) != VK_SUCCESS)
            throw std::runtime_error("failed to create worker command pool");
        BFG_LAYER("create: worker pool ok");
        VkCommandBufferAllocateInfo wcbai{};
        wcbai.sType              = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
        wcbai.commandPool        = st.workerPool;
        wcbai.level              = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        wcbai.commandBufferCount = 4;
        if (dd.allocCmdBufs(device, &wcbai, st.workerCmds) != VK_SUCCESS)
            throw std::runtime_error("failed to allocate worker command buffers");
        BFG_LAYER("create: worker cmds ok");
        for (auto& f : st.workerFences)
            if (dd.createFence(device, &fci, nullptr, &f) != VK_SUCCESS)
                throw std::runtime_error("failed to create worker fence");
        BFG_LAYER("create: worker fences ok, launching thread");
        st.workerRun = true;
        st.workerThread = std::thread(presentWorkerLoop, &st);
        BFG_LAYER("create: worker thread launched");
    } catch (const std::exception& e) {
        BFG_LAYER_E("Exception in CreateSwapchainKHR setup — layer will passthrough: %s", e.what());
        st.cleanup(dd, device);
    } catch (...) {
        BFG_LAYER_E("Unknown exception in CreateSwapchainKHR setup — layer will passthrough");
        st.cleanup(dd, device);
    }

    {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_swapchains[*pSwapchain] = std::move(stHolder);
    }
    BFG_LAYER("CreateSwapchainKHR returning to app");
#endif
    return VK_SUCCESS;
}

VKAPI_ATTR void VKAPI_CALL BionicFG_DestroySwapchainKHR(
        VkDevice device,
        VkSwapchainKHR swapchain,
        const VkAllocationCallbacks* pAllocator) {
    BFG_LAYER("DestroySwapchainKHR enter: %p", (void*)swapchain);
    // Same rule as the retire path: cleanup() re-enters our hooks, so it must
    // not run under g_mtx.
    std::unique_ptr<SwapState> retired;
    DeviceData ddLocal{};
    bool haveDd = false;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto dit = g_devices.find(dispatchKey(device));
        if (dit != g_devices.end()) { ddLocal = dit->second; haveDd = true; }
        auto sit = g_swapchains.find(swapchain);
        if (sit != g_swapchains.end()) {
            retired = std::move(sit->second);
            g_swapchains.erase(sit);
        }
        g_swapDevice.erase(swapchain);
    }
    if (retired) {
        if (haveDd) retired->cleanup(ddLocal, retired->device);
        std::lock_guard<std::mutex> lk(g_mtx);
        g_retiredSwapStates.push_back(std::move(retired));
    }
    if (haveDd)
        ddLocal.destroySwapchain(device, swapchain, pAllocator);
}

// ─── Present / acquire helpers ───────────────────────────────────────────────

static bool findDeviceForQueueOrSwapchain(VkQueue queue, VkSwapchainKHR swapchain,
                                           void** outDevKey, QueueData* outQueueData = nullptr) {
    std::lock_guard<std::mutex> lk(g_mtx);
    auto qit = g_queues.find(queue);
    if (qit != g_queues.end()) {
        if (outDevKey) *outDevKey = qit->second.deviceKey;
        if (outQueueData) *outQueueData = qit->second;
        return qit->second.deviceKey != nullptr;
    }
    auto sit = g_swapDevice.find(swapchain);
    if (sit != g_swapDevice.end()) {
        if (outDevKey) *outDevKey = sit->second;
        if (outQueueData) *outQueueData = QueueData{sit->second, VK_QUEUE_FAMILY_IGNORED};
        return sit->second != nullptr;
    }
    return false;
}

static VkResult callNextPresent(VkQueue queue, const VkPresentInfoKHR* presentInfo) {
    if (!presentInfo || presentInfo->swapchainCount == 0) {
        std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
        return vkQueuePresentKHR(queue, presentInfo);
    }
    void* devKey = nullptr;
    findDeviceForQueueOrSwapchain(queue, presentInfo->pSwapchains[0], &devKey, nullptr);
    PFN_vkQueuePresentKHR nextPresent = nullptr;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto dit = g_devices.find(devKey);
        if (dit != g_devices.end()) nextPresent = dit->second.queuePresent;
    }
    std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
    return nextPresent ? nextPresent(queue, presentInfo) : vkQueuePresentKHR(queue, presentInfo);
}

static DeviceData deviceDataForQueue(VkQueue queue) {
    void* key = nullptr;
    DeviceData dd{};
    if (findDeviceForQueueOrSwapchain(queue, VK_NULL_HANDLE, &key, nullptr)) {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_devices.find(key);
        if (it != g_devices.end()) dd = it->second;
    }
    if (!dd.queueSubmit) {
        // Unknown queue handle: with a single tracked device (the only case on
        // this stack) its dispatch pointers are valid for every one of its
        // queues. Failing closed here exits the game on the first submit.
        std::lock_guard<std::mutex> lk(g_mtx);
        if (g_devices.size() == 1) dd = g_devices.begin()->second;
    }
    return dd;
}

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_QueueSubmit(
        VkQueue queue, uint32_t submitCount, const VkSubmitInfo* pSubmits, VkFence fence) {
    DeviceData dd = deviceDataForQueue(queue);
    if (!dd.queueSubmit) {
        BFG_LAYER_E("QueueSubmit: unresolvable queue %p", (void*)queue);
        return VK_ERROR_INITIALIZATION_FAILED;
    }
    std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
    return dd.queueSubmit(queue, submitCount, pSubmits, fence);
}

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_QueueSubmit2(
        VkQueue queue, uint32_t submitCount, const VkSubmitInfo2* pSubmits, VkFence fence) {
    DeviceData dd = deviceDataForQueue(queue);
    if (!dd.queueSubmit2) return VK_ERROR_INITIALIZATION_FAILED;
    std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
    return dd.queueSubmit2(queue, submitCount, pSubmits, fence);
}

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_QueueSubmit2KHR(
        VkQueue queue, uint32_t submitCount, const VkSubmitInfo2* pSubmits, VkFence fence) {
    DeviceData dd = deviceDataForQueue(queue);
    if (!dd.queueSubmit2KHR) return VK_ERROR_INITIALIZATION_FAILED;
    std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
    return dd.queueSubmit2KHR(queue, submitCount, pSubmits, fence);
}

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_QueueWaitIdle(VkQueue queue) {
    DeviceData dd = deviceDataForQueue(queue);
    if (!dd.queueWaitIdle) return VK_ERROR_INITIALIZATION_FAILED;
    std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
    return dd.queueWaitIdle(queue);
}

static VkResult acquireGeneratedImage(const DeviceData& dd, VkDevice device,
                                      VkSwapchainKHR swapchain, VkSemaphore signalSemaphore,
                                      uint64_t timeoutNs, uint32_t* imageIndex) {
    if (dd.acquireNextImage) {
        return lockedPollAcquire(dd, device, swapchain, timeoutNs, signalSemaphore, VK_NULL_HANDLE, imageIndex);
    }
    if (dd.acquireNextImage2) {
        VkAcquireNextImageInfoKHR info{};
        info.sType      = VK_STRUCTURE_TYPE_ACQUIRE_NEXT_IMAGE_INFO_KHR;
        info.swapchain  = swapchain;
        info.timeout    = timeoutNs;
        info.semaphore  = signalSemaphore;
        info.fence      = VK_NULL_HANDLE;
        info.deviceMask = 1;
        return dd.acquireNextImage2(device, &info, imageIndex);
    }
    return VK_ERROR_EXTENSION_NOT_PRESENT;
}

static void presentWorkerLoop(SwapState* st) {
    BFG_LAYER("worker thread entered");
    VkDevice device = st->device;
    VkSwapchainKHR swapchain = st->selfHandle;
    const DeviceData dd = st->ddCopy;
    for (;;) {
        SwapState::WorkerJob j;
        {
            std::unique_lock<std::mutex> lk(st->jobMtx);
            while (!st->jobCv.wait_for(lk, std::chrono::seconds(5),
                                       [&]{ return st->jobPending || !st->workerRun; })) {
                if (st->wIdleBeeps++ < 12)
                    BFG_LAYER("worker heartbeat: idle 5s, jobs so far %llu", (unsigned long long)st->wJobs);
            }
            if (!st->jobPending) {
                BFG_LAYER("worker loop exiting: run=%d jobs=%llu",
                          (int)st->workerRun, (unsigned long long)st->wJobs);
                break;
            }
            j = st->job;
            st->jobPending = false;
        }
        const bool wtr = st->wJobs < 12;
        if (wtr) BFG_LAYER("worker[%llu]: job img=%u gen=%d dueIn=%.2fms",
                           (unsigned long long)st->wJobs, j.imgIdx, j.genCount,
                           (j.realDueNs - nowNs()) / 1e6);
        int64_t lastGenNs = 0;
        for (int k = 0; k < j.genCount && k < 3; ++k) {
            const int64_t due = j.realDueNs - (int64_t)(j.genCount - k) * j.outIntervalNs;
            const int64_t noww = nowNs();
            if (due > noww) sleepUntilNs(due);
            // The blit was recorded, submitted and fenced by the game thread;
            // presenting on timeout anyway (stale content) beats leaking the
            // acquired image out of the pool.
            VkResult fw = dd.waitForFences(device, 1, &st->genFences[j.genFenceSlot[k]], VK_TRUE, 100000000ull);
            if (fw != VK_SUCCESS && st->wGenFenceTimeout++ < 8)
                BFG_LAYER_E("worker: gen blit fence late (%d); presenting anyway", fw);
            VkPresentInfoKHR gpi{};
            gpi.sType          = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
            gpi.swapchainCount = 1;
            gpi.pSwapchains    = &swapchain;
            gpi.pImageIndices  = &j.genIdx[k];
            VkResult gpr;
            {
                std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
                gpr = dd.queuePresent(st->computeQueue, &gpi);
            }
            lastGenNs = nowNs();
            if (gpr == VK_SUCCESS || gpr == VK_SUBOPTIMAL_KHR) st->wGenOk++;
            else if (st->wGenPresentErr++ < 8)
                BFG_LAYER_E("worker gen present failed: %d", gpr);
            if (wtr) BFG_LAYER("worker[%llu]: gen k=%d idx=%u present=%d",
                               (unsigned long long)st->wJobs, k, j.genIdx[k], gpr);
        }
        {
            const int64_t noww = nowNs();
            if (j.realDueNs > noww) sleepUntilNs(j.realDueNs);
        }
        VkPresentInfoKHR rpi{};
        rpi.sType          = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
        rpi.swapchainCount = 1;
        rpi.pSwapchains    = &swapchain;
        rpi.pImageIndices  = &j.imgIdx;
#ifdef VK_KHR_present_id
        VkPresentIdKHR presentId{};
        if (j.hasPresentId) {
            presentId.sType          = VK_STRUCTURE_TYPE_PRESENT_ID_KHR;
            presentId.swapchainCount = 1;
            presentId.pPresentIds    = &j.presentId;
            rpi.pNext = &presentId;
        }
#endif
        VkResult pr;
        {
            std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
            pr = dd.queuePresent(st->computeQueue, &rpi);
        }
        if (wtr) BFG_LAYER("worker[%llu]: real present=%d img=%u pid=%llu",
                           (unsigned long long)st->wJobs, pr, j.imgIdx,
                           j.hasPresentId ? (unsigned long long)j.presentId : 0ull);
        if (pr != VK_SUCCESS && pr != VK_SUBOPTIMAL_KHR) {
            st->deferredResult.store((int)pr);
            if (st->wRealPresentErr++ < 5)
                BFG_LAYER_E("worker real present failed: %d", pr);
        }
        st->lastWorkerRealNs.store(nowNs());
        if (lastGenNs != 0) { st->wGenGapNs += (uint64_t)(nowNs() - lastGenNs); st->wGenGapCount++; }
        st->wJobs++;
        st->wJobDurNs += (uint64_t)(nowNs() - j.realDueNs) + 0; // lateness only
        if (st->wJobs % 120 == 0) {
            BFG_LAYER("worker: jobs=%llu genOk=%llu acqFail=%llu fenceTO=%llu submitFail=%llu salvage=%llu genPresErr=%llu realErr=%llu avgLate=%.2fms",
                      (unsigned long long)st->wJobs, (unsigned long long)st->wGenOk,
                      (unsigned long long)st->wGenAcqFail, (unsigned long long)st->wGenFenceTimeout,
                      (unsigned long long)st->wGenSubmitFail, (unsigned long long)st->wGenSalvage,
                      (unsigned long long)st->wGenPresentErr, (unsigned long long)st->wRealPresentErr,
                      st->wJobDurNs / 120.0 / 1e6);
            if (st->wGenGapCount > 0)
                BFG_LAYER("worker: gen->real spacing avg %.2fms over %llu pairs",
                          st->wGenGapNs / (double)st->wGenGapCount / 1e6,
                          (unsigned long long)st->wGenGapCount);
            st->wGenGapNs = 0; st->wGenGapCount = 0;
            st->wJobDurNs = 0;
        }
        {
            std::lock_guard<std::mutex> lk(st->jobMtx);
            st->jobDone = true;
        }
        st->jobCv.notify_all();
    }
}

// ─── QueuePresentKHR ──────────────────────────────────────────────────────────

// Bound the cross-context fence waits in the present path. The copy command
// buffer is submitted waiting on the application's *own* present semaphores
// (DXVK's, here), then we wait on its fence. On some ICDs that bridge to a
// separate host driver (e.g. Winlator/Bannerlator's wrapper_icd -> Turnip via
// adrenotools) the host queue/semaphore model differs and that fence never
// signals, hanging the present thread forever (-> ANR/SIGQUIT; observed as a
// 36s freeze on first interpolated frame). Every wait is bounded so the present
// ALWAYS returns and degrades to a normal real-frame present instead of hanging
// — that alone is what prevents the ANR, no matter how many frames time out.
//
// Two distinct concerns, deliberately kept separate:
//  1. Sync incompatibility — the fence *never* signals. Detected by a GENEROUS
//     fixed timeout on the copy fences so a merely-slow frame (shader compilation,
//     queue backlog) is not misclassified; after enough CONSECUTIVE timeouts we
//     disable framegen for the swapchain to stop wasting time on a hopelessly
//     broken path. The fixed fallback is the DEFAULT; deriving the bound from the
//     frame budget is opt-in (derive_sync_timeout) because at init — before the
//     swapchain settles and before the fps limit may even be known — a derived
//     bound is unreliable (a footgun, as flagged in review).
//  2. Generated-frame cadence — a generated frame is merely late. When a base
//     fps limit is set, generated frames get a SHORTER deadline derived from the
//     MEASURED base-frame interval (a cap is a ceiling, not a promise on base
//     perf) with a tolerance band, so a slightly-late frame is still presented
//     (slightly off-pace beats a hard skip) and only a big overrun is skipped to
//     hold pace. A cadence miss is NOT counted as a sync failure.
static constexpr uint64_t kSyncFenceTimeoutNoLimitNs = 500000000ull; // 500ms fixed fallback
static constexpr uint64_t kSyncFenceTimeoutMinNs     = 200000000ull; // 200ms floor
static constexpr uint64_t kSyncFenceTimeoutMaxNs     = 1000000000ull;// 1s cap
static constexpr uint32_t kMaxFenceTimeouts          = 6;  // consecutive before disabling framegen
// Cadence tolerance: allow a generated frame up to 1.5x its target output
// interval before skipping it (numerator/denominator to avoid float math).
static constexpr uint64_t kGenDeadlineSlackNum       = 3;
static constexpr uint64_t kGenDeadlineSlackDen       = 2;

// Generous "is the sync path stuck?" bound. Fixed fallback by default; only when
// derive_sync_timeout is opted-in AND a base cap is set does it scale to ~4
// base-frame intervals (clamped).
static uint64_t syncFenceTimeoutNs(const LayerConf& c) {
    int lim = c.effectiveFpsLimit();
    if (!c.deriveSyncTimeout || lim <= 0) return kSyncFenceTimeoutNoLimitNs;
    uint64_t budget = 1000000000ull / (uint64_t)lim;          // one base-frame interval
    uint64_t t = budget * 4;
    if (t < kSyncFenceTimeoutMinNs) t = kSyncFenceTimeoutMinNs;
    if (t > kSyncFenceTimeoutMaxNs) t = kSyncFenceTimeoutMaxNs;
    return t;
}

// Per-generated-frame "keep cadence" deadline. Returns 0 when no base cap is set
// (no cadence target -> fall back to the sync bound). When a cap is set, the
// target output interval is derived from the MEASURED recent base interval
// (EWMA) divided by the multiplier, then widened by a tolerance slack so real
// base variance doesn't cause needless skips. Never exceeds the sync bound.
static uint64_t genFrameDeadlineNs(const SwapState& st) {
    const LayerConf& c = st.conf;
    int lim = c.effectiveFpsLimit();
    if (lim <= 0) return 0;                                   // no cadence target without a cap
    uint64_t mult = (uint64_t)std::max(1, c.multiplier);
    // Prefer the measured base interval so the deadline tracks REAL base perf
    // (the cap is a ceiling, not a guarantee); fall back to nominal 1s/limit
    // until we have a sample.
    uint64_t baseInterval = (st.baseIntervalEwmaNs > 0)
        ? st.baseIntervalEwmaNs
        : (1000000000ull / (uint64_t)lim);
    uint64_t outInterval = baseInterval / mult;
    uint64_t d = outInterval * kGenDeadlineSlackNum / kGenDeadlineSlackDen;
    if (d < 1000000ull) d = 1000000ull;                       // 1ms floor
    uint64_t cap = syncFenceTimeoutNs(c);
    if (d > cap) d = cap;
    return d;
}

// Increment the given per-type timeout counter and disable framegen for the
// swapchain once it reaches the threshold. Counters are independent so a
// healthy copy path can't reset a stuck generated-frame path.
static void noteFenceTimeout(SwapState& st, uint32_t& counter, const char* which) {
    if (++counter >= kMaxFenceTimeouts && !st.framegenForceDisabled) {
        st.framegenForceDisabled = true;
        st.conf.enabled = false;
        BFG_LAYER_E("disabling framegen for this swapchain after %u consecutive %s fence "
                    "timeouts (present-path sync incompatible with this ICD); real frames only "
                    "for the rest of this swapchain (a conf hot-reload will NOT re-enable it)",
                    counter, which);
    }
}

VKAPI_ATTR VkResult VKAPI_CALL BionicFG_QueuePresentKHR(
        VkQueue queue,
        const VkPresentInfoKHR* pPresentInfo) {
    if (!pPresentInfo || pPresentInfo->swapchainCount != 1) {
        if (pPresentInfo && pPresentInfo->swapchainCount > 1)
            BFG_LAYER("multi-swapchain present (%u) is not transformed; passing through", pPresentInfo->swapchainCount);
        return callNextPresent(queue, pPresentInfo);
    }

    VkSwapchainKHR swapchain = pPresentInfo->pSwapchains[0];
    uint32_t imgIdx = pPresentInfo->pImageIndices ? pPresentInfo->pImageIndices[0] : UINT32_MAX;

    void* devKey = nullptr;
    QueueData qd{};
    if (!findDeviceForQueueOrSwapchain(queue, swapchain, &devKey, &qd))
        return callNextPresent(queue, pPresentInfo);

    DeviceData dd;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto dit = g_devices.find(devKey);
        if (dit == g_devices.end()) return callNextPresent(queue, pPresentInfo);
        dd = dit->second;
    }

    SwapState* stPtr = nullptr;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_swapchains.find(swapchain);
        if (it == g_swapchains.end()) return callNextPresent(queue, pPresentInfo);
        stPtr = it->second.get();
    }
    SwapState& st = *stPtr;

    if (!st.conf.configPath.empty()) {
        int64_t currentStamp = fileStamp(st.conf.configPath);
        if (currentStamp != 0 && currentStamp != st.conf.configStamp) {
            const LayerConf oldConf = st.conf;
            LayerConf newConf = readConf();

            if (configNeedsSwapchainRecreate(oldConf, newConf)) {
                st.conf = newConf;
                BFG_LAYER("config changed; requesting swapchain recreate enabled=%d mult=%d flow=%.2f model=%d",
                          st.conf.enabled ? 1 : 0, st.conf.multiplier, st.conf.flowScale, st.conf.model);
                return VK_ERROR_OUT_OF_DATE_KHR;
            }

#if defined(__ANDROID__) || defined(BFG_GLIBC)
            const bool oldActive = oldConf.multiplier >= 2;
            const bool newActive = newConf.multiplier >= 2;

            if (!newActive) {
                if (st.fgCtx) {
                    st.fgCtx->destroy();
                    st.fgCtx.reset();
                }
                st.conf = newConf;
                BFG_LAYER("config hot-reloaded framegen=off flow=%.2f model=%d",
                          st.conf.flowScale, st.conf.model);
            } else {
                const bool needsContextRebuild =
                    !oldActive ||
                    !st.fgCtx ||
                    (oldConf.multiplier != newConf.multiplier) ||
                    (oldConf.model != newConf.model);

                if (needsContextRebuild) {
                    if (rebuildFramegenContext(st, newConf)) {
                        st.conf = newConf;
                        // The rebuilt context owns fresh frame images with no
                        // content; skip interpolation for one frame so prev is
                        // re-seeded before the next run
                        st.frameCount = 0;
                        BFG_LAYER("config hot-reloaded mult=%d flow=%.2f model=%d via context rebuild",
                                  st.conf.multiplier, st.conf.flowScale, st.conf.model);
                    } else {
                        BFG_LAYER_E("config rebuild failed; keeping old config enabled=%d mult=%d flow=%.2f model=%d",
                                    oldConf.enabled ? 1 : 0, oldConf.multiplier, oldConf.flowScale, oldConf.model);
                    }
                } else {
                    st.conf = newConf;
                    if (st.fgCtx) {
                        st.fgCtx->updateConfig(makeFramegenConfig(st, st.conf));
                        BFG_LAYER("config hot-reloaded flow=%.2f", st.conf.flowScale);
                    }
                }
            }
#else
            {
                st.conf = newConf;
            }
#endif
        }
    }

    // Base frame-rate limiter. Caps the base so with framegen N× the on-screen
    // rate is fps_limit × N (GameHub/LSFG semantics). Two placements:
    //
    // - Passthrough / no framegen this frame: sleep HERE, at the start of the
    //   call, like a plain fps cap.
    // - Framegen active: DEFER the sleep into the present sequence below. The
    //   generated and real presents are queued back-to-back, so they always
    //   display on consecutive vblanks — pairs then a gap — no matter the cap.
    //   Splitting the same sleep budget between them (gen at due-interval/mult,
    //   real at due) spreads the presents evenly across the base interval at
    //   no base-fps cost; it only spends pacing slack that existed anyway.
    //   When the base can't keep up with the cap there is no slack and the
    //   sleeps naturally no-op, degrading to today's behavior.
    const int effFpsLimit = st.conf.effectiveFpsLimit();
    bool paceDeferred = false;
    int64_t paceDueNs = 0;
    if (!st.inPresent && effFpsLimit > 0) {
        const int64_t targetNs = 1000000000LL / effFpsLimit;
        const int64_t now = nowNs();
#if defined(__ANDROID__) || defined(BFG_GLIBC)
        paceDeferred = st.conf.enabled && !st.framegenForceDisabled && st.fgCtx &&
                       st.conf.multiplier >= 2 && st.frameCount > 0;
#endif
        if (paceDeferred) {
            paceDueNs = (st.lastPresentNs != 0) ? st.lastPresentNs + targetNs : now;
        } else if (st.lastPresentNs != 0 && now < st.lastPresentNs + targetNs) {
            const int64_t due = st.lastPresentNs + targetNs;
            sleepUntilNs(due);
            st.lastPresentNs = due;          // anchor to schedule to avoid drift
        } else {
            st.lastPresentNs = now;          // first frame or we're already behind
        }
    } else if (effFpsLimit <= 0) {
        st.lastPresentNs = 0;                // reset so re-enabling starts clean
    }

    // Track the DELIVERED real-frame interval (sampled after any pacing sleep, so
    // it reflects true on-device base cadence — which a cap doesn't guarantee) as
    // an EWMA. Feeds the generated-frame cadence deadline so it tolerates real
    // base variance instead of assuming the nominal 1s/limit.
    if (!st.inPresent) {
        const int64_t nowReal = nowNs();
        if (st.lastRealPresentNs != 0 && nowReal > st.lastRealPresentNs) {
            const uint64_t delta = (uint64_t)(nowReal - st.lastRealPresentNs);
            st.baseIntervalEwmaNs = (st.baseIntervalEwmaNs == 0)
                ? delta
                : (st.baseIntervalEwmaNs * 7 + delta) / 8;   // EWMA, alpha = 1/8
        }
        st.lastRealPresentNs = nowReal;
    }

    if (st.hasPendingReal && !st.inPresent &&
        (st.framegenForceDisabled || !st.conf.enabled || !st.fgCtx)) {
        // Framegen switched off with a frame still in the pipeline: flush it
        // so present ordering (and any present-id wait) stays intact.
        {
            std::unique_lock<std::mutex> lk(st.jobMtx);
            st.jobCv.wait_for(lk, std::chrono::milliseconds(500),
                              [&]{ return st.jobDone && !st.jobPending; });
        }
        VkPresentInfoKHR fpi{};
        fpi.sType          = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
        fpi.swapchainCount = 1;
        fpi.pSwapchains    = &swapchain;
        fpi.pImageIndices  = &st.pendingImgIdx;
#ifdef VK_KHR_present_id
        VkPresentIdKHR fpid{};
        if (st.pendingHasPid) {
            fpid.sType          = VK_STRUCTURE_TYPE_PRESENT_ID_KHR;
            fpid.swapchainCount = 1;
            fpid.pPresentIds    = &st.pendingPid;
            fpi.pNext = &fpid;
        }
#endif
        {
            std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
            dd.queuePresent(queue, &fpi);
        }
        st.hasPendingReal = false;
        if (st.genHeld) {
            VkPresentInfoKHR hpi{};
            hpi.sType              = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
            hpi.waitSemaphoreCount = 1;
            hpi.pWaitSemaphores    = &st.acquireSems[0];
            hpi.swapchainCount     = 1;
            hpi.pSwapchains        = &swapchain;
            hpi.pImageIndices      = &st.genHeldIdx;
            std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
            dd.queuePresent(queue, &hpi);
            st.genHeld = false;
        }
    }
    if (st.inPresent || st.framegenForceDisabled || !st.conf.enabled || !st.fgCtx)
        return callNextPresent(queue, pPresentInfo);
    if (imgIdx >= st.images.size()) {
        BFG_LAYER_E("present image index %u out of range (%zu); passing through", imgIdx, st.images.size());
        return callNextPresent(queue, pPresentInfo);
    }
    if (qd.family != VK_QUEUE_FAMILY_IGNORED && st.copyQueueFamily != VK_QUEUE_FAMILY_IGNORED &&
        qd.family != st.copyQueueFamily) {
        BFG_LAYER_E("present queue family changed from %u to %u; passing through to avoid invalid command pool",
                    st.copyQueueFamily, qd.family);
        return callNextPresent(queue, pPresentInfo);
    }

#if !defined(__ANDROID__) && !defined(BFG_GLIBC)
    return callNextPresent(queue, pPresentInfo);
#else
    st.inPresent = true;
    struct Guard { SwapState& s; ~Guard(){ s.inPresent = false; } } guard{st};

    const int64_t tEnter = nowNs();
    const bool tr = st.frameCount < 12;
    if (tr) BFG_LAYER("present[%llu]: enter img=%u waits=%u",
                      (unsigned long long)st.frameCount, imgIdx, pPresentInfo->waitSemaphoreCount);
    if (st.lastCallNs != 0) { st.callGapNs += (uint64_t)(tEnter - st.lastCallNs); st.callCount++; }
    st.lastCallNs = tEnter;
    if (st.callCount == 120) {
        const uint64_t an = g_appAcqWaitCnt.exchange(0);
        const uint64_t at = g_appAcqWaitNs.exchange(0);
        BFG_LAYER("game present-call interval avg %.2fms over 120 calls (app acquire avg %.2fms over %llu)",
                  st.callGapNs / 120.0 / 1e6,
                  an ? at / (double)an / 1e6 : 0.0, (unsigned long long)an);
        st.callGapNs = 0; st.callCount = 0;
    }

    const uint32_t fi = static_cast<uint32_t>(st.frameCount & 1u);
    VkDevice device = st.device;
    const int N = std::min(st.conf.multiplier - 1, 4);
    bool consumedOriginalWaits = false;

    if (!dd.resetCmdBuf || !dd.beginCmdBuf || !dd.endCmdBuf || !dd.queueSubmit || !dd.waitForFences ||
        !dd.resetFences || !dd.cmdBlitImage || !st.copyCmds[fi] || !st.copyFences[fi]) {
        BFG_LAYER_E("copy command infrastructure incomplete; passing through");
        return callNextPresent(queue, pPresentInfo);
    }

    // Surface any deferred failure from the worker's presents on this call
    {
        const int dr = st.deferredResult.exchange(VK_SUCCESS);
        if (dr == (int)VK_ERROR_OUT_OF_DATE_KHR) return VK_ERROR_OUT_OF_DATE_KHR;
    }

    // Wait for the previous frame's worker job before recording new GPU work:
    // serializes the worker's output-blit against the next graph and doubles
    // as the base-rate pacer (the worker finishes at the pace grid).
    {
        std::unique_lock<std::mutex> lk(st.jobMtx);
        if (!st.jobCv.wait_for(lk, std::chrono::milliseconds(200),
                               [&]{ return st.jobDone && !st.jobPending; })) {
            lk.unlock();
            BFG_LAYER_E("present worker stalled; passing frame through");
            return callNextPresent(queue, pPresentInfo);
        }
    }
    if (tr) BFG_LAYER("present[%llu]: prev worker job done (%.2fms)",
                      (unsigned long long)st.frameCount, (nowNs() - tEnter) / 1e6);

    auto pushRealJob = [&](uint32_t img, bool hasPid, uint64_t pid,
                           int genCount, const uint32_t* genIdx, const uint8_t* genSlot) {
        const int64_t nowP = nowNs();
        const int64_t intervalNs = (effFpsLimit > 0)
            ? (1000000000LL / effFpsLimit)
            : (st.baseIntervalEwmaNs > 0 ? (int64_t)st.baseIntervalEwmaNs : 16666667LL);
        const int64_t lastReal = st.lastWorkerRealNs.load();
        const int64_t realDue = (lastReal > 0 && lastReal + intervalNs > nowP)
            ? lastReal + intervalNs : nowP;
        st.lastPresentNs = realDue;
        {
            std::lock_guard<std::mutex> lk(st.jobMtx);
            st.job.imgIdx        = img;
            st.job.genCount      = genCount;
            for (int i = 0; i < genCount && i < 3; ++i) {
                st.job.genIdx[i]       = genIdx[i];
                st.job.genFenceSlot[i] = genSlot[i];
            }
            st.job.realDueNs     = realDue;
            st.job.outIntervalNs = intervalNs / std::max(1, st.conf.multiplier);
            st.job.hasPresentId  = hasPid;
            st.job.presentId     = pid;
            st.jobPending = true;
            st.jobDone    = false;
        }
        st.jobCv.notify_all();
    };
    auto awaitWorker = [&] {
        std::unique_lock<std::mutex> lk(st.jobMtx);
        st.jobCv.wait_for(lk, std::chrono::milliseconds(500),
                          [&]{ return st.jobDone && !st.jobPending; });
    };

    // Drain the previous call's pipeline stage. Its graph has had a full frame
    // of GPU time and queue order makes the outputs valid for the blit, so its
    // gen frames go up now and the worker gets its deferred real present.
    if (st.hasPendingReal) {
        uint32_t drainedIdx[3] = {};
        uint8_t  drainedSlot[3] = {};
        int      drained = 0;
        VkImageBlit dblit{};
        dblit.srcSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
        dblit.srcOffsets[1]  = {(int32_t)st.extent.width, (int32_t)st.extent.height, 1};
        dblit.dstSubresource = dblit.srcSubresource;
        dblit.dstOffsets[1]  = dblit.srcOffsets[1];
        for (int k = 0; k < st.pendingGen && k < 4; ++k) {
            uint32_t genIdx = UINT32_MAX;
            VkResult acq;
            if (k == 0 && st.genHeld) {
                genIdx = st.genHeldIdx;
                st.genHeld = false;
                acq = VK_SUCCESS;
            } else {
                acq = acquireGeneratedImage(dd, device, swapchain, st.acquireSems[k], 8000000ull, &genIdx);
            }
            if (tr) BFG_LAYER("present[%llu]: gen k=%d acq=%d idx=%u",
                              (unsigned long long)st.frameCount, k, acq, genIdx);
            if (acq != VK_SUCCESS && acq != VK_SUBOPTIMAL_KHR) {
                st.wGenAcqFail++;
                if (k == 0) st.genDrySpell++;
                continue;
            }
            if (k == 0) st.genDrySpell = 0;
            auto consumeAcquire = [&](const char* why) {
                VkPresentInfoKHR spi{};
                spi.sType              = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
                spi.waitSemaphoreCount = 1;
                spi.pWaitSemaphores    = &st.acquireSems[k];
                spi.swapchainCount     = 1;
                spi.pSwapchains        = &swapchain;
                spi.pImageIndices      = &genIdx;
                VkResult sr;
                {
                    std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
                    sr = dd.queuePresent(queue, &spi);
                }
                BFG_LAYER_E("gen frame %d presented unblitted (%s, present=%d)", k, why, sr);
            };
            if (genIdx >= st.images.size()) { consumeAcquire("index out of range"); continue; }
            if (dd.waitForFences(device, 1, &st.genFences[k], VK_TRUE, syncFenceTimeoutNs(st.conf)) != VK_SUCCESS) {
                noteFenceTimeout(st, st.genFenceTimeouts, "gen");
                consumeAcquire("gen fence timeout");
                continue;
            }
            VkCommandBuffer gcmd = st.genCmds[k];
            dd.resetCmdBuf(gcmd, 0);
            VkCommandBufferBeginInfo gbi{};
            gbi.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
            gbi.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
            if (dd.beginCmdBuf(gcmd, &gbi) != VK_SUCCESS) { consumeAcquire("begin failed"); continue; }
            VkImage out = st.fgCtx->outputAt((size_t)k).handle();
            layerImageBarrier(dd, gcmd, out,
                VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, VK_ACCESS_SHADER_WRITE_BIT,
                VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_READ_BIT,
                VK_IMAGE_LAYOUT_GENERAL, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL);
            layerImageBarrier(dd, gcmd, st.images[genIdx],
                VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, 0,
                VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_WRITE_BIT,
                VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL);
            dd.cmdBlitImage(gcmd, out, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
                st.images[genIdx], VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, &dblit, VK_FILTER_LINEAR);
            layerImageBarrier(dd, gcmd, out,
                VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_READ_BIT,
                VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, VK_ACCESS_SHADER_WRITE_BIT,
                VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, VK_IMAGE_LAYOUT_GENERAL);
            layerImageBarrier(dd, gcmd, st.images[genIdx],
                VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_WRITE_BIT,
                VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT, 0,
                VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_PRESENT_SRC_KHR);
            if (dd.endCmdBuf(gcmd) != VK_SUCCESS) { consumeAcquire("end failed"); continue; }
            VkPipelineStageFlags gwm = VK_PIPELINE_STAGE_TRANSFER_BIT;
            VkSubmitInfo gsi{};
            gsi.sType                = VK_STRUCTURE_TYPE_SUBMIT_INFO;
            gsi.waitSemaphoreCount   = 1;
            gsi.pWaitSemaphores      = &st.acquireSems[k];
            gsi.pWaitDstStageMask    = &gwm;
            gsi.commandBufferCount   = 1;
            gsi.pCommandBuffers      = &gcmd;
            dd.resetFences(device, 1, &st.genFences[k]);
            VkResult gsr;
            {
                std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
                gsr = dd.queueSubmit(queue, 1, &gsi, st.genFences[k]);
            }
            if (gsr == VK_SUCCESS) {
                st.genFenceTimeouts = 0;
                drainedIdx[drained]  = genIdx;
                drainedSlot[drained] = (uint8_t)k;
                drained++;
            } else {
                consumeAcquire("submit failed");
                VkSubmitInfo fsi{};
                fsi.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
                std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
                dd.queueSubmit(queue, 0, &fsi, st.genFences[k]);
            }
            if (tr) BFG_LAYER("present[%llu]: gen k=%d blit submit=%d idx=%u",
                              (unsigned long long)st.frameCount, k, gsr, genIdx);
        }
        pushRealJob(st.pendingImgIdx, st.pendingHasPid, st.pendingPid,
                    drained, drainedIdx, drainedSlot);
        st.hasPendingReal = false;
        if (tr) BFG_LAYER("present[%llu]: pending real pushed to worker",
                          (unsigned long long)st.frameCount);
    }

    // --- Step 1: Copy real swapchain image into the context's current frame
    // input. The copy waits on the application's original present semaphores,
    // so the final real present must not wait on those same binary semaphores
    // again.
    VkResult copyPreWait = dd.waitForFences(device, 1, &st.copyFences[fi], VK_TRUE, syncFenceTimeoutNs(st.conf));
    if (copyPreWait == VK_TIMEOUT) {
        BFG_LAYER_E("copy fence (pre-submit) wait timed out; passing through");
        noteFenceTimeout(st, st.copyFenceTimeouts, "copy");
        awaitWorker();
        return callNextPresent(queue, pPresentInfo);
    }
    if (copyPreWait != VK_SUCCESS || dd.resetFences(device, 1, &st.copyFences[fi]) != VK_SUCCESS) {
        BFG_LAYER_E("copy fence wait/reset failed; passing through");
        awaitWorker();
        return callNextPresent(queue, pPresentInfo);
    }

    dd.resetCmdBuf(st.copyCmds[fi], 0);
    VkCommandBufferBeginInfo cbi{};
    cbi.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
    cbi.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    if (dd.beginCmdBuf(st.copyCmds[fi], &cbi) != VK_SUCCESS) {
        BFG_LAYER_E("begin copy command buffer failed; passing through");
        awaitWorker();
        return callNextPresent(queue, pPresentInfo);
    }

    VkCommandBuffer cmd = st.copyCmds[fi];
    layerImageBarrier(dd, cmd, st.images[imgIdx],
        VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, 0,
        VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_READ_BIT,
        VK_IMAGE_LAYOUT_PRESENT_SRC_KHR, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL);

    bionic_fg::vk::Image& currIn = st.fgCtx->currInput();
    // srcStage must cover the async graph still READING this image as its
    // previous-frame input (WAR): the copy is queue-ordered after that run,
    // but the layout transition is a write and needs the execution dependency.
    layerImageBarrier(dd, cmd, currIn.handle(),
        VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, 0,
        VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_WRITE_BIT,
        currIn.layout, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL);
    currIn.layout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;

    VkImageBlit blit{};
    blit.srcSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
    blit.srcOffsets[1]  = {(int32_t)st.extent.width, (int32_t)st.extent.height, 1};
    blit.dstSubresource = blit.srcSubresource;
    blit.dstOffsets[1]  = blit.srcOffsets[1];
    dd.cmdBlitImage(cmd, st.images[imgIdx], VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        currIn.handle(), VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        1, &blit, VK_FILTER_NEAREST);

    layerImageBarrier(dd, cmd, st.images[imgIdx],
        VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_READ_BIT,
        VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT, 0,
        VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, VK_IMAGE_LAYOUT_PRESENT_SRC_KHR);
    layerImageBarrier(dd, cmd, currIn.handle(),
        VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_WRITE_BIT,
        VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, VK_ACCESS_SHADER_READ_BIT,
        VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_GENERAL);
    currIn.layout = VK_IMAGE_LAYOUT_GENERAL;

    if (dd.endCmdBuf(cmd) != VK_SUCCESS) {
        BFG_LAYER_E("end copy command buffer failed; passing through");
        awaitWorker();
        return callNextPresent(queue, pPresentInfo);
    }

    std::vector<VkPipelineStageFlags> waitStages(pPresentInfo->waitSemaphoreCount,
                                                 VK_PIPELINE_STAGE_TRANSFER_BIT);
    VkSubmitInfo si{};
    si.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    si.waitSemaphoreCount = pPresentInfo->waitSemaphoreCount;
    si.pWaitSemaphores = pPresentInfo->pWaitSemaphores;
    si.pWaitDstStageMask = waitStages.empty() ? nullptr : waitStages.data();
    si.commandBufferCount = 1;
    si.pCommandBuffers = &cmd;
    VkResult submitRes;
    {
        std::lock_guard<std::mutex> ql(g_queueSubmitMtx);
        submitRes = dd.queueSubmit(queue, 1, &si, st.copyFences[fi]);
    }
    if (submitRes != VK_SUCCESS) {
        BFG_LAYER_E("copy queue submit failed: %d; passing through", submitRes);
        awaitWorker();
        return callNextPresent(queue, pPresentInfo);
    }
    consumedOriginalWaits = pPresentInfo->waitSemaphoreCount > 0;
    const int64_t tCopySubmitted = nowNs();
    if (tr) BFG_LAYER("present[%llu]: copy submitted", (unsigned long long)st.frameCount);

    (void)consumedOriginalWaits;
    st.copyFenceTimeouts = 0;
    const int64_t tCopyDone = nowNs();
    int64_t tGraphDone = tCopyDone;

    // --- Step 2: Run framegen after we have both previous and current inputs.
    if (st.frameCount > 0) {
        st.fgCtx->run();
        tGraphDone = nowNs();
        if (tr) BFG_LAYER("present[%llu]: graph submitted (%.2fms)",
                          (unsigned long long)st.frameCount, (tGraphDone - tCopyDone) / 1e6);
    }

    const int64_t tGenDone = nowNs();

    st.fgCtx->swapFrameInputs();
    st.fgCtx->updateConfig(makeFramegenConfig(st, st.conf));
    const bool ranGraph = st.frameCount > 0;
    st.frameCount++;

    bool thisHasPid = false;
    uint64_t thisPid = 0;
#ifdef VK_KHR_present_id
    for (const auto* pn = reinterpret_cast<const VkBaseInStructure*>(pPresentInfo->pNext);
         pn; pn = pn->pNext) {
        if (pn->sType == VK_STRUCTURE_TYPE_PRESENT_ID_KHR) {
            const auto* pid = reinterpret_cast<const VkPresentIdKHR*>(pn);
            if (pid->swapchainCount >= 1 && pid->pPresentIds) {
                thisHasPid = true;
                thisPid    = pid->pPresentIds[0];
            }
            break;
        }
    }
#endif
    if (ranGraph) {
        st.hasPendingReal = true;
        st.pendingImgIdx  = imgIdx;
        st.pendingGen     = N;
        st.pendingHasPid  = thisHasPid;
        st.pendingPid     = thisPid;
        if (!st.genHeld) {
            uint32_t pf = UINT32_MAX;
            VkResult pr2 = acquireGeneratedImage(dd, device, swapchain, st.acquireSems[0], 0, &pf);
            if ((pr2 == VK_SUCCESS || pr2 == VK_SUBOPTIMAL_KHR) && pf < st.images.size()) {
                st.genHeld = true;
                st.genHeldIdx = pf;
            }
        }
        if (tr) BFG_LAYER("present[%llu]: graph in flight, real deferred (prefetch=%d)",
                          (unsigned long long)(st.frameCount - 1), (int)st.genHeld);
    } else {
        pushRealJob(imgIdx, thisHasPid, thisPid, 0, nullptr, nullptr);
        if (tr) BFG_LAYER("present[%llu]: job pushed gen=0, returning",
                          (unsigned long long)(st.frameCount - 1));
    }
    VkResult presentRes = VK_SUCCESS;

    static const bool kPerfLog = [] {
        const char* e = getenv("BIONIC_FG_PERF_LOG");
        return !(e && e[0] == '0');
    }();
    if (ranGraph && kPerfLog) {
        st.perfCount++;
        st.perfCopySubmitNs += (uint64_t)(tCopySubmitted - tEnter);
        st.perfCopyWaitNs   += (uint64_t)(tCopyDone - tCopySubmitted);
        st.perfGraphNs      += (uint64_t)(tGraphDone - tCopyDone);
        st.perfGenNs        += (uint64_t)(tGenDone - tGraphDone);
        st.perfTotalNs      += (uint64_t)(nowNs() - tEnter);
        if (st.perfCount >= 120) {
            const double n = (double)st.perfCount;
            BFG_LAYER("timing avg over %llu frames (ms): copySubmit=%.2f copyWait=%.2f graph=%.2f gen=%.2f total=%.2f (base %.1f fps)",
                      (unsigned long long)st.perfCount,
                      st.perfCopySubmitNs / n / 1e6,
                      st.perfCopyWaitNs / n / 1e6,
                      st.perfGraphNs / n / 1e6,
                      st.perfGenNs / n / 1e6,
                      st.perfTotalNs / n / 1e6,
                      st.baseIntervalEwmaNs > 0 ? 1e9 / (double)st.baseIntervalEwmaNs : 0.0);
            st.perfCount = 0;
            st.perfCopySubmitNs = st.perfCopyWaitNs = st.perfGraphNs = st.perfGenNs = st.perfTotalNs = 0;
        }
    }

    return presentRes;
#endif
}

// ─── GetProcAddr entry points ─────────────────────────────────────────────────

#define HOOK(fn) if (std::strcmp(name, "vk" #fn) == 0 || std::strcmp(name, #fn) == 0) return reinterpret_cast<PFN_vkVoidFunction>(BionicFG_##fn)

VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL BionicFG_GetDeviceProcAddr(
        VkDevice device, const char* name) {
    HOOK(DestroyDevice);
    HOOK(GetDeviceQueue);
    HOOK(GetDeviceQueue2);
    HOOK(CreateSwapchainKHR);
    HOOK(DestroySwapchainKHR);
    HOOK(AcquireNextImageKHR);
    HOOK(AcquireNextImage2KHR);
    HOOK(WaitForPresentKHR);
    HOOK(QueuePresentKHR);
    HOOK(QueueSubmit);
    HOOK(QueueSubmit2);
    HOOK(QueueSubmit2KHR);
    HOOK(QueueWaitIdle);

    std::lock_guard<std::mutex> lk(g_mtx);
    auto it = g_devices.find(dispatchKey(device));
    if (it != g_devices.end() && it->second.next)
        return it->second.next(device, name);
    return nullptr;
}

VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL BionicFG_GetInstanceProcAddr(
        VkInstance instance, const char* name) {
    HOOK(CreateInstance);
    HOOK(DestroyInstance);
    HOOK(EnumeratePhysicalDevices);
    HOOK(CreateDevice);
    HOOK(DestroyDevice);
    HOOK(GetDeviceQueue);
    HOOK(GetDeviceQueue2);
    HOOK(CreateSwapchainKHR);
    HOOK(DestroySwapchainKHR);
    HOOK(AcquireNextImageKHR);
    HOOK(AcquireNextImage2KHR);
    HOOK(WaitForPresentKHR);
    HOOK(QueuePresentKHR);
    HOOK(QueueSubmit);
    HOOK(QueueSubmit2);
    HOOK(QueueSubmit2KHR);
    HOOK(QueueWaitIdle);
    if (std::strcmp(name, "vkGetDeviceProcAddr") == 0)
        return reinterpret_cast<PFN_vkVoidFunction>(BionicFG_GetDeviceProcAddr);
    if (std::strcmp(name, "vkGetInstanceProcAddr") == 0)
        return reinterpret_cast<PFN_vkVoidFunction>(BionicFG_GetInstanceProcAddr);

    if (instance == VK_NULL_HANDLE) return nullptr;
    std::lock_guard<std::mutex> lk(g_mtx);
    auto it = g_instances.find(dispatchKey(instance));
    if (it != g_instances.end() && it->second.next)
        return it->second.next(instance, name);
    return nullptr;
}

#undef HOOK

} // namespace bfg::layer

// ─── C-linkage exports (referenced by manifest JSON) ─────────────────────────

extern "C" BFG_EXPORT VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL
BionicFG_GetInstanceProcAddr(VkInstance inst, const char* name) {
    return bfg::layer::BionicFG_GetInstanceProcAddr(inst, name);
}

extern "C" BFG_EXPORT VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL
BionicFG_GetDeviceProcAddr(VkDevice dev, const char* name) {
    return bfg::layer::BionicFG_GetDeviceProcAddr(dev, name);
}
