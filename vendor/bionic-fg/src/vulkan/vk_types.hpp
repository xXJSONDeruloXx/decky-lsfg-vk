#pragma once

#include <vulkan/vulkan.h>
#ifdef __ANDROID__
#include <vulkan/vulkan_android.h>
#include <android/hardware_buffer.h>
#endif

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace bionic_fg::vk {

// ─── Forward decls ──────────────────────────────────────────────────────────

class Device;

// ─── Error ──────────────────────────────────────────────────────────────────

struct VkError {
    VkResult code;
    std::string msg;
    VkError(VkResult r, const char* m) : code(r), msg(m) {}
};

// ─── Device ─────────────────────────────────────────────────────────────────

class Device {
public:
    Device() = default;
    explicit Device(std::nullptr_t) {}

    // Creates a standalone Vulkan device on the first capable physical device.
    // On Android, requests the AHB extension chain automatically.
    static Device create();
    // Wrap an existing device (owned=false: destroy() does nothing).
    // `memPropsFn` should be the next-layer dispatch for
    // vkGetPhysicalDeviceMemoryProperties (obtained via the layer's
    // nextGetInstanceProcAddr): calling the global loader symbol from inside a
    // layer with a chain-level physical-device handle can crash. Pass nullptr
    // (e.g. the standalone path) to fall back to the global symbol.
    static Device wrap(VkInstance inst, VkPhysicalDevice phys, VkDevice dev,
                       uint32_t computeFamily, VkQueue queue,
                       PFN_vkGetPhysicalDeviceMemoryProperties memPropsFn = nullptr);

    VkDevice handle()           const { return device_; }
    VkPhysicalDevice physical() const { return physical_; }
    uint32_t computeFamily()    const { return computeFamily_; }
    VkQueue  computeQueue()     const { return computeQueue_; }
    // Physical-device memory-properties query routed through the layer dispatch
    // when wrapped; falls back to the global symbol otherwise.
    PFN_vkGetPhysicalDeviceMemoryProperties memPropsFn() const {
        return memPropsFn_ ? memPropsFn_ : &vkGetPhysicalDeviceMemoryProperties;
    }
    bool valid() const { return device_ != VK_NULL_HANDLE; }

    void destroy();

private:
    bool         owned_       = true;
    VkInstance   instance_     = VK_NULL_HANDLE;
    VkDevice     device_       = VK_NULL_HANDLE;
    VkPhysicalDevice physical_ = VK_NULL_HANDLE;
    uint32_t     computeFamily_= 0;
    VkQueue      computeQueue_ = VK_NULL_HANDLE;
    PFN_vkGetPhysicalDeviceMemoryProperties memPropsFn_ = nullptr;
};

// ─── Image ───────────────────────────────────────────────────────────────────

struct ImageInfo {
    VkExtent2D          extent  = {0,0};
    VkFormat            format  = VK_FORMAT_R8G8B8A8_UNORM;
    VkImageUsageFlags   usage   = VK_IMAGE_USAGE_STORAGE_BIT|VK_IMAGE_USAGE_SAMPLED_BIT;
    VkImageAspectFlags  aspect  = VK_IMAGE_ASPECT_COLOR_BIT;
};

class Image {
public:
    Image() = default;
    // Device-local allocation
    Image(const Device& dev, const ImageInfo& info);
#ifdef __ANDROID__
    // AHardwareBuffer import
    Image(const Device& dev, const ImageInfo& info, AHardwareBuffer* ahb);
#endif
    void destroy(const Device& dev);

    VkImage     handle()   const { return image_; }
    VkImageView view()     const { return view_; }
    VkExtent2D  extent()   const { return extent_; }
    VkFormat    format()   const { return format_; }
    bool external()        const { return external_; }
    bool valid()           const { return image_ != VK_NULL_HANDLE; }

    VkImageLayout layout = VK_IMAGE_LAYOUT_UNDEFINED;

private:
    VkImage        image_   = VK_NULL_HANDLE;
    VkDeviceMemory memory_  = VK_NULL_HANDLE;
    VkImageView    view_    = VK_NULL_HANDLE;
    VkExtent2D     extent_  = {};
    VkFormat       format_  = VK_FORMAT_UNDEFINED;
    bool           external_= false;
};

// ─── Buffer ──────────────────────────────────────────────────────────────────

class Buffer {
public:
    Buffer() = default;
    Buffer(const Device& dev, VkDeviceSize size, VkBufferUsageFlags usage,
           const void* initialData = nullptr);
    void destroy(const Device& dev);
    void write(const Device& dev, const void* data, VkDeviceSize size);

    VkBuffer     handle() const { return buffer_; }
    VkDeviceSize size()   const { return size_; }
    bool valid()          const { return buffer_ != VK_NULL_HANDLE; }
    const void*  mapped() const { return mapped_; }

private:
    VkBuffer       buffer_ = VK_NULL_HANDLE;
    VkDeviceMemory memory_ = VK_NULL_HANDLE;
    VkDeviceSize   size_   = 0;
    void*          mapped_ = nullptr;
};

// ─── CommandPool / CommandBuffer ─────────────────────────────────────────────

class CommandPool {
public:
    CommandPool() = default;
    CommandPool(const Device& dev);
    void destroy(const Device& dev);
    VkCommandPool handle() const { return pool_; }
    bool valid() const { return pool_ != VK_NULL_HANDLE; }
private:
    VkCommandPool pool_ = VK_NULL_HANDLE;
};

class CommandBuffer {
public:
    CommandBuffer() = default;
    CommandBuffer(const Device& dev, const CommandPool& pool);
    void destroy(const Device& dev, const CommandPool& pool);
    void begin();
    void end();
    void submit(const Device& dev, VkFence fence = VK_NULL_HANDLE);
    void submitAndWait(const Device& dev);
    VkCommandBuffer handle() const { return buf_; }
    bool valid() const { return buf_ != VK_NULL_HANDLE; }
private:
    VkCommandBuffer buf_ = VK_NULL_HANDLE;
};

// ─── Fence ───────────────────────────────────────────────────────────────────

class Fence {
public:
    Fence() = default;
    explicit Fence(const Device& dev, bool signaled = false);
    void destroy(const Device& dev);
    void wait(const Device& dev);
    void reset(const Device& dev);
    VkFence handle() const { return fence_; }
    bool valid() const { return fence_ != VK_NULL_HANDLE; }
private:
    VkFence fence_ = VK_NULL_HANDLE;
};

// ─── Sampler ─────────────────────────────────────────────────────────────────

class Sampler {
public:
    Sampler() = default;
    Sampler(const Device& dev, VkFilter filter = VK_FILTER_LINEAR,
            VkSamplerAddressMode mode = VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER);
    void destroy(const Device& dev);
    VkSampler handle() const { return sampler_; }
    bool valid() const { return sampler_ != VK_NULL_HANDLE; }
private:
    VkSampler sampler_ = VK_NULL_HANDLE;
};

// ─── Descriptor helpers ──────────────────────────────────────────────────────

struct DescriptorBinding {
    uint32_t          binding;
    VkDescriptorType  type;
    uint32_t          count = 1;
};

class DescriptorPool {
public:
    DescriptorPool() = default;
    DescriptorPool(const Device& dev, uint32_t maxSets,
                   const std::vector<VkDescriptorPoolSize>& sizes);
    void destroy(const Device& dev);
    VkDescriptorPool handle() const { return pool_; }
    bool valid() const { return pool_ != VK_NULL_HANDLE; }
private:
    VkDescriptorPool pool_ = VK_NULL_HANDLE;
};

class DescriptorSetLayout {
public:
    DescriptorSetLayout() = default;
    DescriptorSetLayout(const Device& dev,
                        const std::vector<DescriptorBinding>& bindings);
    void destroy(const Device& dev);
    VkDescriptorSetLayout handle() const { return layout_; }
    bool valid() const { return layout_ != VK_NULL_HANDLE; }
private:
    VkDescriptorSetLayout layout_ = VK_NULL_HANDLE;
};

class DescriptorSet {
public:
    DescriptorSet() = default;
    DescriptorSet(const Device& dev, VkDescriptorPool pool,
                  VkDescriptorSetLayout layout);

    void bindUBO(const Device& dev, uint32_t binding, const Buffer& buf);
    void bindStorageImage(const Device& dev, uint32_t binding, const Image& img);
    void bindSampledImage(const Device& dev, uint32_t binding, const Image& img,
                          VkImageLayout layout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL);
    void bindSampler(const Device& dev, uint32_t binding, const Sampler& sampler);
    void bindCombinedImageSampler(const Device& dev, uint32_t binding,
                                  const Image& img, const Sampler& sampler,
                                  VkImageLayout layout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL);

    VkDescriptorSet handle() const { return set_; }
    bool valid() const { return set_ != VK_NULL_HANDLE; }
private:
    VkDescriptorSet set_ = VK_NULL_HANDLE;
};

// ─── Pipeline ────────────────────────────────────────────────────────────────

class ComputePipeline {
public:
    ComputePipeline() = default;
    ComputePipeline(const Device& dev,
                    const uint8_t* spirvData, size_t spirvBytes,
                    VkDescriptorSetLayout descriptorLayout,
                    const VkPushConstantRange* pushRange = nullptr);
    void destroy(const Device& dev);
    void bind(VkCommandBuffer cmd) const;
    void bindDescriptorSet(VkCommandBuffer cmd, VkDescriptorSet set) const;
    void dispatch(VkCommandBuffer cmd, uint32_t gx, uint32_t gy, uint32_t gz = 1) const;
    VkPipeline handle()       const { return pipeline_; }
    VkPipelineLayout layout() const { return layout_; }
    bool valid() const { return pipeline_ != VK_NULL_HANDLE; }
private:
    VkPipeline       pipeline_= VK_NULL_HANDLE;
    VkPipelineLayout layout_  = VK_NULL_HANDLE;
};

// ─── Barrier helpers ─────────────────────────────────────────────────────────

void imageBarrier(VkCommandBuffer cmd, VkImage image,
                  VkPipelineStageFlags srcStage, VkAccessFlags srcAccess,
                  VkPipelineStageFlags dstStage, VkAccessFlags dstAccess,
                  VkImageLayout oldLayout, VkImageLayout newLayout,
                  uint32_t srcQueueFamily = VK_QUEUE_FAMILY_IGNORED,
                  uint32_t dstQueueFamily = VK_QUEUE_FAMILY_IGNORED);

void acquireFromExternal(VkCommandBuffer cmd, const Image& img,
                         uint32_t dstQueueFamily,
                         VkAccessFlags dstAccess);

void releaseToExternal(VkCommandBuffer cmd, const Image& img,
                       uint32_t srcQueueFamily,
                       VkAccessFlags srcAccess);

// ─── Utilities ───────────────────────────────────────────────────────────────

uint32_t findMemoryType(const Device& dev, uint32_t typeBits,
                        VkMemoryPropertyFlags props);

} // namespace bionic_fg::vk
