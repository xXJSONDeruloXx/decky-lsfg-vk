#pragma once

#include "bionic_fg/config.hpp"
#include "vulkan/vk_types.hpp"
#include "shaders_registry.hpp"

#include <vulkan/vulkan.h>
#ifdef __ANDROID__
#include <android/hardware_buffer.h>
#endif

#include <cstdint>
#include <memory>
#include <vector>

namespace bionic_fg {

// ─── UBO layouts (matching embedded shader expectations) ─────────────────

struct SynthUBO { float flowScale; float alpha; float epsilon; };
struct FlowUBO   { float flowScale; float pad0; float pad1; float pad2; };
struct PyramidUBO{ uint32_t scale; uint32_t aspect; uint32_t pad0; uint32_t pad1; };

// ─── Pass ────────────────────────────────────────────────────────────────────

class Pass {
public:
    Pass() = default;
    Pass(const vk::Device& dev,
         VkDescriptorPool descPool,
         int embeddedShaderIdx,
         const std::vector<vk::DescriptorBinding>& bindings);

    void destroy(const vk::Device& dev);

    // Static bindings write BOTH parity sets; the per-frame input bindings use
    // the parity variants so the set an in-flight graph is reading is never
    // touched (the async run pipeline keeps up to two frames on the GPU).
    void bindUBO    (const vk::Device& dev, uint32_t binding, const vk::Buffer& buf);
    void bindSampled(const vk::Device& dev, uint32_t binding, const vk::Image&  img,
                     const vk::Sampler& sampler);
    void bindSampledGeneral(const vk::Device& dev, uint32_t binding, const vk::Image& img,
                            const vk::Sampler& sampler);
    void bindStorage(const vk::Device& dev, uint32_t binding, const vk::Image&  img);
    void bindSampledAt(const vk::Device& dev, uint32_t parity, uint32_t binding,
                       const vk::Image& img, const vk::Sampler& sampler);
    void bindSampledGeneralAt(const vk::Device& dev, uint32_t parity, uint32_t binding,
                              const vk::Image& img, const vk::Sampler& sampler);

    void dispatch(VkCommandBuffer cmd, uint32_t gx, uint32_t gy, uint32_t parity = 0) const;
    bool valid() const { return pipeline_.valid(); }

private:
    vk::DescriptorSetLayout layout_;
    vk::DescriptorSet       descSets_[2];
    vk::ComputePipeline     pipeline_;
};

// ─── FramegenContext ─────────────────────────────────────────────────────────

class FramegenContext {
public:
    FramegenContext() = default;

#if defined(__ANDROID__) || defined(BFG_GLIBC)
#ifdef __ANDROID__
    // `device` is the application's own VkDevice (wrapped, not owned). Running
    // the interpolation on the SAME device the swapchain/AHBs live on avoids the
    // cross-device fence deadlock that hangs a standalone second device on
    // wrapper-ICD stacks (Winlator/Turnip). See BIONIC_FG_INTEGRATION_REPORT.md.
    // Null entries in prevAhb/currAhb/outputAhbs allocate plain device-local
    // images instead of importing AHBs.
    static std::unique_ptr<FramegenContext> create(
        const vk::Device& device,
        AHardwareBuffer* prevAhb,
        AHardwareBuffer* currAhb,
        const std::vector<AHardwareBuffer*>& outputAhbs,
        VkExtent2D extent,
        VkFormat   format,
        const Config& cfg);
#endif

    // Single-device layer mode: the context owns device-local input/output
    // images (no AHB round-trip, no external queue-family transfers); the
    // layer blits the swapchain into currInput() and out of outputAt(k).
    static std::unique_ptr<FramegenContext> create(
        const vk::Device& device,
        uint32_t provisionedOutputs,
        VkExtent2D extent,
        VkFormat   format,
        const Config& cfg);

#ifdef __ANDROID__
    void present(AHardwareBuffer* newPrevAhb, AHardwareBuffer* newCurrAhb);
    void run() { present(nullptr, nullptr); }
#else
    void present();
    void run() { present(); }
#endif

    // Rotate frame inputs after a presented frame: the previous "current"
    // becomes "previous" and its image is reused as the next blit target.
    void swapFrameInputs();

    vk::Image& prevInput()          { return prevFrame_; }
    vk::Image& currInput()          { return currFrame_; }
    vk::Image& outputAt(size_t k)   { return outputImages_[k]; }
    size_t     outputCount() const  { return outputImages_.size(); }
#endif

    void updateConfig(const Config& cfg);
    void waitIdle();
    void destroy();

    bool        valid()    const { return device_.valid(); }
    std::string describe() const;

private:
    // ── Vulkan core ──────────────────────────────────────────────────────────
    Config      cfg_;
    VkExtent2D  extent_  = {};
    VkFormat    format_  = VK_FORMAT_R8G8B8A8_UNORM;

    vk::Device      device_;
    vk::CommandPool cmdPool_;
    vk::Sampler     linearSampler_;
    vk::Sampler     nearestSampler_;
    VkDescriptorPool descPool_ = VK_NULL_HANDLE;

    // ── AHB-backed images (external, not owned) ───────────────────────────
    vk::Image prevFrame_;
    vk::Image currFrame_;
    std::vector<vk::Image> outputImages_;

    // Shared-graph resources (descriptor labels dNNN.bXX from the traced
    // model-1 edge map; both models bind into the same graph).
    std::vector<vk::Image> model1Resources_;

    std::vector<Pass> model1GraphPasses_;       // runtime-confirmed dispatch graph
    std::vector<VkExtent2D> model1GraphDispatch_; // per-pass group counts
    // Per-pass image read/write sets, used to emit barriers only at true
    // dependencies instead of after every dispatch (~100 pipeline drains).
    std::vector<std::vector<VkImage>> model1Reads_;
    std::vector<std::vector<VkImage>> model1Writes_;
    size_t model1FinalPassStart_ = 0;

    // ── UBO buffers ──────────────────────────────────────────────────────────
    vk::Buffer uboPyramid_;
    vk::Buffer uboFlow_;
    std::vector<vk::Buffer> uboSynth_;

    // Flow-magnitude probe (model 0): spread samples of the three flow fields
    // shader_04 consumes, copied to a host-visible buffer each run and logged
    // every 120 frames so "is the flow alive" is observable instead of
    // inferred from artifacts.
    vk::Buffer dbgFlowBuf_;
    uint32_t   dbgLogCounter_ = 0;
    size_t     dbgFlowIdx_[3] = {SIZE_MAX, SIZE_MAX, SIZE_MAX};

    // ── Per-frame command buffer + fence ─────────────────────────────────────
    struct Frame {
        vk::CommandBuffer cmd;
        vk::Fence         fence;
    };
    Frame    frames_[2];
    uint32_t frameIdx_ = 0;

#ifdef __ANDROID__
    AHardwareBuffer* prevAhbPtr_ = nullptr;
    AHardwareBuffer* currAhbPtr_ = nullptr;
#endif
#if defined(__ANDROID__) || defined(BFG_GLIBC)
    void rebindFrameInputs();
#endif
};

} // namespace bionic_fg
