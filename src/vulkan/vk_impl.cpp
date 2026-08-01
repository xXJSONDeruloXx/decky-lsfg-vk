#include "vk_types.hpp"
#include "../logging.hpp"

#include <cstring>
#include <stdexcept>
#include <vector>
#include <optional>

namespace bionic_fg::vk {

// ─── Utils ───────────────────────────────────────────────────────────────────

uint32_t findMemoryType(const Device& dev, uint32_t typeBits,
                        VkMemoryPropertyFlags props) {
    VkPhysicalDeviceMemoryProperties memProps;
    dev.memPropsFn()(dev.physical(), &memProps);
    for (uint32_t i = 0; i < memProps.memoryTypeCount; ++i) {
        if ((typeBits & (1u << i)) &&
            (memProps.memoryTypes[i].propertyFlags & props) == props) {
            return i;
        }
    }
    throw VkError(VK_ERROR_UNKNOWN, "No suitable memory type found");
}

// ─── Device ──────────────────────────────────────────────────────────────────

static const char* kRequiredDeviceExts[] = {
#ifdef __ANDROID__
    "VK_ANDROID_external_memory_android_hardware_buffer",
    "VK_KHR_external_memory",
    "VK_KHR_sampler_ycbcr_conversion",
    "VK_KHR_dedicated_allocation",
    "VK_KHR_get_memory_requirements2",
    "VK_KHR_bind_memory2",
    "VK_KHR_maintenance1",
    // NOTE: VK_KHR_external_memory_capabilities and
    // VK_KHR_get_physical_device_properties2 are *instance* extensions (and core
    // since Vulkan 1.1) — they are enabled on the instance below, not the device.
    // Listing them here made vkEnumerateDeviceExtensionProperties always report
    // them missing ("Device ext not available"); harmless (they were filtered
    // out before vkCreateDevice) but misleading, so they are removed.
#endif
};

static bool hasExt(const std::vector<VkExtensionProperties>& exts, const char* name) {
    for (const auto& e : exts)
        if (std::strcmp(e.extensionName, name) == 0) return true;
    return false;
}

Device Device::create() {
    // Instance
    VkApplicationInfo appInfo{};
    appInfo.sType              = VK_STRUCTURE_TYPE_APPLICATION_INFO;
    appInfo.pApplicationName   = "BionicFG";
    appInfo.apiVersion         = VK_API_VERSION_1_1;

    std::vector<const char*> instanceExts;
#ifdef __ANDROID__
    instanceExts.push_back("VK_KHR_external_memory_capabilities");
    instanceExts.push_back("VK_KHR_get_physical_device_properties2");
#endif

    VkInstanceCreateInfo ici{};
    ici.sType                   = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
    ici.pApplicationInfo        = &appInfo;
    ici.enabledExtensionCount   = static_cast<uint32_t>(instanceExts.size());
    ici.ppEnabledExtensionNames = instanceExts.data();

    VkInstance inst = VK_NULL_HANDLE;
    VkResult res = vkCreateInstance(&ici, nullptr, &inst);
    if (res != VK_SUCCESS || !inst)
        throw VkError(res, "vkCreateInstance failed");

    // Pick first physical device with a compute queue
    uint32_t devCount = 0;
    vkEnumeratePhysicalDevices(inst, &devCount, nullptr);
    if (devCount == 0) {
        vkDestroyInstance(inst, nullptr);
        throw VkError(VK_ERROR_INITIALIZATION_FAILED, "No Vulkan physical devices");
    }
    std::vector<VkPhysicalDevice> physDevs(devCount);
    vkEnumeratePhysicalDevices(inst, &devCount, physDevs.data());

    VkPhysicalDevice phys = VK_NULL_HANDLE;
    uint32_t computeQF   = 0;
    for (auto pd : physDevs) {
        uint32_t qfCount = 0;
        vkGetPhysicalDeviceQueueFamilyProperties(pd, &qfCount, nullptr);
        std::vector<VkQueueFamilyProperties> qfProps(qfCount);
        vkGetPhysicalDeviceQueueFamilyProperties(pd, &qfCount, qfProps.data());
        for (uint32_t i = 0; i < qfCount; ++i) {
            if (qfProps[i].queueFlags & VK_QUEUE_COMPUTE_BIT) {
                phys       = pd;
                computeQF  = i;
                break;
            }
        }
        if (phys) break;
    }
    if (!phys) {
        vkDestroyInstance(inst, nullptr);
        throw VkError(VK_ERROR_INITIALIZATION_FAILED, "No compute-capable GPU");
    }

    // Check/collect device extensions
    uint32_t extCount = 0;
    vkEnumerateDeviceExtensionProperties(phys, nullptr, &extCount, nullptr);
    std::vector<VkExtensionProperties> availExts(extCount);
    vkEnumerateDeviceExtensionProperties(phys, nullptr, &extCount, availExts.data());

    std::vector<const char*> enabledExts;
    for (const char* ext : kRequiredDeviceExts) {
        if (hasExt(availExts, ext))
            enabledExts.push_back(ext);
        else
            BFG_LOGW("Device ext not available: %s", ext);
    }

    const float qPri = 1.0f;
    VkDeviceQueueCreateInfo qci{};
    qci.sType            = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
    qci.queueFamilyIndex = computeQF;
    qci.queueCount       = 1;
    qci.pQueuePriorities = &qPri;

    VkDeviceCreateInfo dci{};
    dci.sType                   = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
    dci.queueCreateInfoCount    = 1;
    dci.pQueueCreateInfos       = &qci;
    dci.enabledExtensionCount   = static_cast<uint32_t>(enabledExts.size());
    dci.ppEnabledExtensionNames = enabledExts.data();

    VkDevice dev = VK_NULL_HANDLE;
    res = vkCreateDevice(phys, &dci, nullptr, &dev);
    if (res != VK_SUCCESS || !dev) {
        vkDestroyInstance(inst, nullptr);
        throw VkError(res, "vkCreateDevice failed");
    }

    VkQueue queue = VK_NULL_HANDLE;
    vkGetDeviceQueue(dev, computeQF, 0, &queue);

    Device d;
    d.instance_      = inst;
    d.device_        = dev;
    d.physical_      = phys;
    d.computeFamily_ = computeQF;
    d.computeQueue_  = queue;
    BFG_LOGI("Device created: phys=%p dev=%p computeQF=%u", (void*)phys, (void*)dev, computeQF);
    return d;
}

Device Device::wrap(VkInstance inst, VkPhysicalDevice phys, VkDevice dev,
                    uint32_t computeFamily, VkQueue queue,
                    PFN_vkGetPhysicalDeviceMemoryProperties memPropsFn) {
    Device d;
    d.owned_         = false;
    d.instance_      = inst;
    d.physical_      = phys;
    d.device_        = dev;
    d.computeFamily_ = computeFamily;
    d.computeQueue_  = queue;
    d.memPropsFn_    = memPropsFn;
    return d;
}

void Device::destroy() {
    if (!owned_) { device_ = VK_NULL_HANDLE; instance_ = VK_NULL_HANDLE; return; }
    if (device_)   vkDestroyDevice(device_, nullptr);
    if (instance_) vkDestroyInstance(instance_, nullptr);
    device_ = VK_NULL_HANDLE; instance_ = VK_NULL_HANDLE;
}

// ─── Image ───────────────────────────────────────────────────────────────────

Image::Image(const Device& dev, const ImageInfo& info) {
    extent_   = info.extent;
    format_   = info.format;
    external_ = false;

    VkImageCreateInfo ici{};
    ici.sType         = VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;
    ici.imageType     = VK_IMAGE_TYPE_2D;
    ici.format        = info.format;
    ici.extent        = { info.extent.width, info.extent.height, 1 };
    ici.mipLevels     = 1;
    ici.arrayLayers   = 1;
    ici.samples       = VK_SAMPLE_COUNT_1_BIT;
    ici.tiling        = VK_IMAGE_TILING_OPTIMAL;
    ici.usage         = info.usage;
    ici.sharingMode   = VK_SHARING_MODE_EXCLUSIVE;
    ici.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;

    VkResult res = vkCreateImage(dev.handle(), &ici, nullptr, &image_);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateImage failed");

    VkMemoryRequirements memReq{};
    vkGetImageMemoryRequirements(dev.handle(), image_, &memReq);
    uint32_t mt = findMemoryType(dev, memReq.memoryTypeBits,
                                 VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);

    VkMemoryAllocateInfo mai{};
    mai.sType           = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    mai.allocationSize  = memReq.size;
    mai.memoryTypeIndex = mt;

    res = vkAllocateMemory(dev.handle(), &mai, nullptr, &memory_);
    if (res != VK_SUCCESS) {
        vkDestroyImage(dev.handle(), image_, nullptr);
        throw VkError(res, "vkAllocateMemory (image) failed");
    }
    vkBindImageMemory(dev.handle(), image_, memory_, 0);

    VkImageViewCreateInfo vci{};
    vci.sType                           = VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;
    vci.image                           = image_;
    vci.viewType                        = VK_IMAGE_VIEW_TYPE_2D;
    vci.format                          = info.format;
    vci.components.r                    = VK_COMPONENT_SWIZZLE_IDENTITY;
    vci.components.g                    = VK_COMPONENT_SWIZZLE_IDENTITY;
    vci.components.b                    = VK_COMPONENT_SWIZZLE_IDENTITY;
    vci.components.a                    = VK_COMPONENT_SWIZZLE_IDENTITY;
    vci.subresourceRange.aspectMask     = info.aspect;
    vci.subresourceRange.baseMipLevel   = 0;
    vci.subresourceRange.levelCount     = 1;
    vci.subresourceRange.baseArrayLayer = 0;
    vci.subresourceRange.layerCount     = 1;

    res = vkCreateImageView(dev.handle(), &vci, nullptr, &view_);
    if (res != VK_SUCCESS) {
        vkFreeMemory(dev.handle(), memory_, nullptr);
        vkDestroyImage(dev.handle(), image_, nullptr);
        throw VkError(res, "vkCreateImageView failed");
    }
    layout = VK_IMAGE_LAYOUT_UNDEFINED;
}

#ifdef __ANDROID__
Image::Image(const Device& dev, const ImageInfo& info, AHardwareBuffer* ahb) {
    extent_   = info.extent;
    format_   = info.format;
    external_ = true;

    VkAndroidHardwareBufferPropertiesANDROID ahbProps{};
    ahbProps.sType = VK_STRUCTURE_TYPE_ANDROID_HARDWARE_BUFFER_PROPERTIES_ANDROID;
    auto fn = reinterpret_cast<PFN_vkGetAndroidHardwareBufferPropertiesANDROID>(
        vkGetDeviceProcAddr(dev.handle(), "vkGetAndroidHardwareBufferPropertiesANDROID"));
    if (!fn) throw VkError(VK_ERROR_EXTENSION_NOT_PRESENT,
                           "vkGetAndroidHardwareBufferPropertiesANDROID not found");
    VkResult res = fn(dev.handle(), ahb, &ahbProps);
    if (res != VK_SUCCESS) throw VkError(res, "vkGetAndroidHardwareBufferPropertiesANDROID");

    VkExternalMemoryImageCreateInfo emici{};
    emici.sType       = VK_STRUCTURE_TYPE_EXTERNAL_MEMORY_IMAGE_CREATE_INFO;
    emici.handleTypes = VK_EXTERNAL_MEMORY_HANDLE_TYPE_ANDROID_HARDWARE_BUFFER_BIT_ANDROID;

    VkImageCreateInfo ici{};
    ici.sType         = VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;
    ici.pNext         = &emici;
    ici.imageType     = VK_IMAGE_TYPE_2D;
    ici.format        = info.format;
    ici.extent        = { info.extent.width, info.extent.height, 1 };
    ici.mipLevels     = 1;
    ici.arrayLayers   = 1;
    ici.samples       = VK_SAMPLE_COUNT_1_BIT;
    ici.tiling        = VK_IMAGE_TILING_OPTIMAL;
    ici.usage         = info.usage;
    ici.sharingMode   = VK_SHARING_MODE_EXCLUSIVE;
    ici.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;

    res = vkCreateImage(dev.handle(), &ici, nullptr, &image_);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateImage (AHB) failed");

    VkMemoryDedicatedAllocateInfo dedicatedInfo{};
    dedicatedInfo.sType = VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO;
    dedicatedInfo.image = image_;

    VkImportAndroidHardwareBufferInfoANDROID importInfo{};
    importInfo.sType  = VK_STRUCTURE_TYPE_IMPORT_ANDROID_HARDWARE_BUFFER_INFO_ANDROID;
    importInfo.pNext  = &dedicatedInfo;
    importInfo.buffer = ahb;

    VkMemoryAllocateInfo mai{};
    mai.sType           = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    mai.pNext           = &importInfo;
    mai.allocationSize  = ahbProps.allocationSize;
    mai.memoryTypeIndex = 0;
    // find compatible mem type from AHB props
    VkPhysicalDeviceMemoryProperties memProps{};
    dev.memPropsFn()(dev.physical(), &memProps);
    for (uint32_t i = 0; i < memProps.memoryTypeCount; ++i) {
        if (ahbProps.memoryTypeBits & (1u << i)) { mai.memoryTypeIndex = i; break; }
    }

    res = vkAllocateMemory(dev.handle(), &mai, nullptr, &memory_);
    if (res != VK_SUCCESS) {
        vkDestroyImage(dev.handle(), image_, nullptr);
        throw VkError(res, "vkAllocateMemory (AHB) failed");
    }
    vkBindImageMemory(dev.handle(), image_, memory_, 0);

    VkImageViewCreateInfo vci{};
    vci.sType                           = VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;
    vci.image                           = image_;
    vci.viewType                        = VK_IMAGE_VIEW_TYPE_2D;
    vci.format                          = info.format;
    vci.components.r                    = VK_COMPONENT_SWIZZLE_IDENTITY;
    vci.components.g                    = VK_COMPONENT_SWIZZLE_IDENTITY;
    vci.components.b                    = VK_COMPONENT_SWIZZLE_IDENTITY;
    vci.components.a                    = VK_COMPONENT_SWIZZLE_IDENTITY;
    vci.subresourceRange.aspectMask     = info.aspect;
    vci.subresourceRange.baseMipLevel   = 0;
    vci.subresourceRange.levelCount     = 1;
    vci.subresourceRange.baseArrayLayer = 0;
    vci.subresourceRange.layerCount     = 1;

    res = vkCreateImageView(dev.handle(), &vci, nullptr, &view_);
    if (res != VK_SUCCESS) {
        vkFreeMemory(dev.handle(), memory_, nullptr);
        vkDestroyImage(dev.handle(), image_, nullptr);
        throw VkError(res, "vkCreateImageView (AHB) failed");
    }
    layout = VK_IMAGE_LAYOUT_GENERAL; // AHB images start in GENERAL
}
#endif

void Image::destroy(const Device& dev) {
    if (view_)   vkDestroyImageView(dev.handle(), view_, nullptr);
    if (memory_) vkFreeMemory(dev.handle(), memory_, nullptr);
    if (image_)  vkDestroyImage(dev.handle(), image_, nullptr);
    view_   = VK_NULL_HANDLE;
    memory_ = VK_NULL_HANDLE;
    image_  = VK_NULL_HANDLE;
}

// ─── Buffer ──────────────────────────────────────────────────────────────────

Buffer::Buffer(const Device& dev, VkDeviceSize size, VkBufferUsageFlags usage,
               const void* initialData) {
    size_ = size;
    VkBufferCreateInfo bci{};
    bci.sType       = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
    bci.size        = size;
    bci.usage       = usage;
    bci.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    VkResult res = vkCreateBuffer(dev.handle(), &bci, nullptr, &buffer_);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateBuffer failed");

    VkMemoryRequirements memReq{};
    vkGetBufferMemoryRequirements(dev.handle(), buffer_, &memReq);
    uint32_t mt = findMemoryType(dev, memReq.memoryTypeBits,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);

    VkMemoryAllocateInfo mai{};
    mai.sType           = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    mai.allocationSize  = memReq.size;
    mai.memoryTypeIndex = mt;
    res = vkAllocateMemory(dev.handle(), &mai, nullptr, &memory_);
    if (res != VK_SUCCESS) {
        vkDestroyBuffer(dev.handle(), buffer_, nullptr);
        throw VkError(res, "vkAllocateMemory (buffer) failed");
    }
    vkBindBufferMemory(dev.handle(), buffer_, memory_, 0);
    vkMapMemory(dev.handle(), memory_, 0, size, 0, &mapped_);
    if (initialData && mapped_) std::memcpy(mapped_, initialData, size);
}

void Buffer::write(const Device& dev, const void* data, VkDeviceSize sz) {
    (void)dev;
    if (mapped_ && data) std::memcpy(mapped_, data, sz);
}

void Buffer::destroy(const Device& dev) {
    if (mapped_)  vkUnmapMemory(dev.handle(), memory_);
    if (memory_)  vkFreeMemory(dev.handle(), memory_, nullptr);
    if (buffer_)  vkDestroyBuffer(dev.handle(), buffer_, nullptr);
    buffer_ = VK_NULL_HANDLE; memory_ = VK_NULL_HANDLE; mapped_ = nullptr;
}

// ─── CommandPool / CommandBuffer ─────────────────────────────────────────────

CommandPool::CommandPool(const Device& dev) {
    VkCommandPoolCreateInfo cpci{};
    cpci.sType            = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
    cpci.queueFamilyIndex = dev.computeFamily();
    cpci.flags            = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
    VkResult res = vkCreateCommandPool(dev.handle(), &cpci, nullptr, &pool_);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateCommandPool failed");
}
void CommandPool::destroy(const Device& dev) {
    if (pool_) vkDestroyCommandPool(dev.handle(), pool_, nullptr);
    pool_ = VK_NULL_HANDLE;
}

CommandBuffer::CommandBuffer(const Device& dev, const CommandPool& pool) {
    VkCommandBufferAllocateInfo ai{};
    ai.sType              = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    ai.commandPool        = pool.handle();
    ai.level              = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    ai.commandBufferCount = 1;
    VkResult res = vkAllocateCommandBuffers(dev.handle(), &ai, &buf_);
    if (res != VK_SUCCESS) throw VkError(res, "vkAllocateCommandBuffers failed");
}

void CommandBuffer::begin() {
    VkCommandBufferBeginInfo bi{};
    bi.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
    bi.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    vkBeginCommandBuffer(buf_, &bi);
}
void CommandBuffer::end() { vkEndCommandBuffer(buf_); }

void CommandBuffer::submit(const Device& dev, VkFence fence) {
    VkSubmitInfo si{};
    si.sType              = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    si.commandBufferCount = 1;
    si.pCommandBuffers    = &buf_;
    vkQueueSubmit(dev.computeQueue(), 1, &si, fence);
}
void CommandBuffer::submitAndWait(const Device& dev) {
    submit(dev);
    vkQueueWaitIdle(dev.computeQueue());
}
void CommandBuffer::destroy(const Device& dev, const CommandPool& pool) {
    if (buf_) vkFreeCommandBuffers(dev.handle(), pool.handle(), 1, &buf_);
    buf_ = VK_NULL_HANDLE;
}

// ─── Fence ───────────────────────────────────────────────────────────────────

Fence::Fence(const Device& dev, bool signaled) {
    VkFenceCreateInfo fci{};
    fci.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
    fci.flags = signaled ? VK_FENCE_CREATE_SIGNALED_BIT : 0u;
    VkResult res = vkCreateFence(dev.handle(), &fci, nullptr, &fence_);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateFence failed");
}
void Fence::wait(const Device& dev) {
    vkWaitForFences(dev.handle(), 1, &fence_, VK_TRUE, UINT64_MAX);
}
void Fence::reset(const Device& dev) { vkResetFences(dev.handle(), 1, &fence_); }
void Fence::destroy(const Device& dev) {
    if (fence_) vkDestroyFence(dev.handle(), fence_, nullptr);
    fence_ = VK_NULL_HANDLE;
}

// ─── Sampler ─────────────────────────────────────────────────────────────────

Sampler::Sampler(const Device& dev, VkFilter filter, VkSamplerAddressMode mode) {
    VkSamplerCreateInfo sci{};
    sci.sType        = VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO;
    sci.magFilter    = filter;
    sci.minFilter    = filter;
    sci.addressModeU = mode;
    sci.addressModeV = mode;
    sci.addressModeW = mode;
    VkResult res = vkCreateSampler(dev.handle(), &sci, nullptr, &sampler_);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateSampler failed");
}
void Sampler::destroy(const Device& dev) {
    if (sampler_) vkDestroySampler(dev.handle(), sampler_, nullptr);
    sampler_ = VK_NULL_HANDLE;
}

// ─── Descriptor ──────────────────────────────────────────────────────────────

DescriptorPool::DescriptorPool(const Device& dev, uint32_t maxSets,
                                const std::vector<VkDescriptorPoolSize>& sizes) {
    VkDescriptorPoolCreateInfo pci{};
    pci.sType         = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;
    pci.flags         = VK_DESCRIPTOR_POOL_CREATE_FREE_DESCRIPTOR_SET_BIT;
    pci.maxSets       = maxSets;
    pci.poolSizeCount = static_cast<uint32_t>(sizes.size());
    pci.pPoolSizes    = sizes.data();
    VkResult res = vkCreateDescriptorPool(dev.handle(), &pci, nullptr, &pool_);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateDescriptorPool failed");
}
void DescriptorPool::destroy(const Device& dev) {
    if (pool_) vkDestroyDescriptorPool(dev.handle(), pool_, nullptr);
    pool_ = VK_NULL_HANDLE;
}

DescriptorSetLayout::DescriptorSetLayout(const Device& dev,
        const std::vector<DescriptorBinding>& bindings) {
    std::vector<VkDescriptorSetLayoutBinding> vkBindings;
    vkBindings.reserve(bindings.size());
    for (const auto& b : bindings) {
        VkDescriptorSetLayoutBinding vkb{};
        vkb.binding         = b.binding;
        vkb.descriptorType  = b.type;
        vkb.descriptorCount = b.count;
        vkb.stageFlags      = VK_SHADER_STAGE_COMPUTE_BIT;
        vkBindings.push_back(vkb);
    }
    VkDescriptorSetLayoutCreateInfo lci{};
    lci.sType        = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
    lci.bindingCount = static_cast<uint32_t>(vkBindings.size());
    lci.pBindings    = vkBindings.data();
    VkResult res = vkCreateDescriptorSetLayout(dev.handle(), &lci, nullptr, &layout_);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateDescriptorSetLayout failed");
}
void DescriptorSetLayout::destroy(const Device& dev) {
    if (layout_) vkDestroyDescriptorSetLayout(dev.handle(), layout_, nullptr);
    layout_ = VK_NULL_HANDLE;
}

DescriptorSet::DescriptorSet(const Device& dev, VkDescriptorPool pool,
                              VkDescriptorSetLayout layout) {
    VkDescriptorSetAllocateInfo ai{};
    ai.sType              = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
    ai.descriptorPool     = pool;
    ai.descriptorSetCount = 1;
    ai.pSetLayouts        = &layout;
    VkResult res = vkAllocateDescriptorSets(dev.handle(), &ai, &set_);
    if (res != VK_SUCCESS) throw VkError(res, "vkAllocateDescriptorSets failed");
}

void DescriptorSet::bindUBO(const Device& dev, uint32_t binding, const Buffer& buf) {
    VkDescriptorBufferInfo bi{};
    bi.buffer = buf.handle(); bi.offset = 0; bi.range = buf.size();
    VkWriteDescriptorSet w{};
    w.sType           = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
    w.dstSet          = set_;
    w.dstBinding      = binding;
    w.descriptorCount = 1;
    w.descriptorType  = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;
    w.pBufferInfo     = &bi;
    vkUpdateDescriptorSets(dev.handle(), 1, &w, 0, nullptr);
}

void DescriptorSet::bindStorageImage(const Device& dev, uint32_t binding, const Image& img) {
    VkDescriptorImageInfo ii{};
    ii.imageView   = img.view();
    ii.imageLayout = VK_IMAGE_LAYOUT_GENERAL;
    VkWriteDescriptorSet w{};
    w.sType           = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
    w.dstSet          = set_;
    w.dstBinding      = binding;
    w.descriptorCount = 1;
    w.descriptorType  = VK_DESCRIPTOR_TYPE_STORAGE_IMAGE;
    w.pImageInfo      = &ii;
    vkUpdateDescriptorSets(dev.handle(), 1, &w, 0, nullptr);
}

void DescriptorSet::bindSampledImage(const Device& dev, uint32_t binding,
                                     const Image& img, VkImageLayout layout) {
    VkDescriptorImageInfo ii{};
    ii.imageView   = img.view();
    ii.imageLayout = layout;
    VkWriteDescriptorSet w{};
    w.sType           = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
    w.dstSet          = set_;
    w.dstBinding      = binding;
    w.descriptorCount = 1;
    w.descriptorType  = VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE;
    w.pImageInfo      = &ii;
    vkUpdateDescriptorSets(dev.handle(), 1, &w, 0, nullptr);
}

void DescriptorSet::bindSampler(const Device& dev, uint32_t binding, const Sampler& sampler) {
    VkDescriptorImageInfo ii{};
    ii.sampler = sampler.handle();
    VkWriteDescriptorSet w{};
    w.sType           = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
    w.dstSet          = set_;
    w.dstBinding      = binding;
    w.descriptorCount = 1;
    w.descriptorType  = VK_DESCRIPTOR_TYPE_SAMPLER;
    w.pImageInfo      = &ii;
    vkUpdateDescriptorSets(dev.handle(), 1, &w, 0, nullptr);
}

void DescriptorSet::bindCombinedImageSampler(const Device& dev, uint32_t binding,
        const Image& img, const Sampler& sampler, VkImageLayout layout) {
    VkDescriptorImageInfo ii{};
    ii.sampler     = sampler.handle();
    ii.imageView   = img.view();
    ii.imageLayout = layout;
    VkWriteDescriptorSet w{};
    w.sType           = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
    w.dstSet          = set_;
    w.dstBinding      = binding;
    w.descriptorCount = 1;
    w.descriptorType  = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
    w.pImageInfo      = &ii;
    vkUpdateDescriptorSets(dev.handle(), 1, &w, 0, nullptr);
}

// ─── ComputePipeline ─────────────────────────────────────────────────────────

ComputePipeline::ComputePipeline(const Device& dev,
                                 const uint8_t* spirvData, size_t spirvBytes,
                                 VkDescriptorSetLayout descriptorLayout,
                                 const VkPushConstantRange* pushRange) {
    VkShaderModuleCreateInfo smci{};
    smci.sType    = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
    smci.codeSize = spirvBytes;
    smci.pCode    = reinterpret_cast<const uint32_t*>(spirvData);
    VkShaderModule shaderMod = VK_NULL_HANDLE;
    VkResult res = vkCreateShaderModule(dev.handle(), &smci, nullptr, &shaderMod);
    if (res != VK_SUCCESS) throw VkError(res, "vkCreateShaderModule failed");

    VkPipelineLayoutCreateInfo plci{};
    plci.sType          = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    plci.setLayoutCount = 1;
    plci.pSetLayouts    = &descriptorLayout;
    if (pushRange) {
        plci.pushConstantRangeCount = 1;
        plci.pPushConstantRanges    = pushRange;
    }
    res = vkCreatePipelineLayout(dev.handle(), &plci, nullptr, &layout_);
    if (res != VK_SUCCESS) {
        vkDestroyShaderModule(dev.handle(), shaderMod, nullptr);
        throw VkError(res, "vkCreatePipelineLayout failed");
    }

    VkPipelineShaderStageCreateInfo ssci{};
    ssci.sType  = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    ssci.stage  = VK_SHADER_STAGE_COMPUTE_BIT;
    ssci.module = shaderMod;
    ssci.pName  = "main";

    VkComputePipelineCreateInfo cpci{};
    cpci.sType  = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO;
    cpci.stage  = ssci;
    cpci.layout = layout_;
    res = vkCreateComputePipelines(dev.handle(), VK_NULL_HANDLE, 1, &cpci, nullptr, &pipeline_);
    vkDestroyShaderModule(dev.handle(), shaderMod, nullptr);
    if (res != VK_SUCCESS) {
        vkDestroyPipelineLayout(dev.handle(), layout_, nullptr);
        throw VkError(res, "vkCreateComputePipelines failed");
    }
}

void ComputePipeline::bind(VkCommandBuffer cmd) const {
    vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_COMPUTE, pipeline_);
}
void ComputePipeline::bindDescriptorSet(VkCommandBuffer cmd, VkDescriptorSet set) const {
    vkCmdBindDescriptorSets(cmd, VK_PIPELINE_BIND_POINT_COMPUTE,
                            layout_, 0, 1, &set, 0, nullptr);
}
void ComputePipeline::dispatch(VkCommandBuffer cmd,
                               uint32_t gx, uint32_t gy, uint32_t gz) const {
    vkCmdDispatch(cmd, gx, gy, gz);
}
void ComputePipeline::destroy(const Device& dev) {
    if (pipeline_) vkDestroyPipeline(dev.handle(), pipeline_, nullptr);
    if (layout_)   vkDestroyPipelineLayout(dev.handle(), layout_, nullptr);
    pipeline_ = VK_NULL_HANDLE; layout_ = VK_NULL_HANDLE;
}

// ─── Barriers ────────────────────────────────────────────────────────────────

void imageBarrier(VkCommandBuffer cmd, VkImage image,
                  VkPipelineStageFlags srcStage, VkAccessFlags srcAccess,
                  VkPipelineStageFlags dstStage, VkAccessFlags dstAccess,
                  VkImageLayout oldLayout, VkImageLayout newLayout,
                  uint32_t srcQF, uint32_t dstQF) {
    VkImageMemoryBarrier b{};
    b.sType               = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;
    b.srcAccessMask       = srcAccess;
    b.dstAccessMask       = dstAccess;
    b.oldLayout           = oldLayout;
    b.newLayout           = newLayout;
    b.srcQueueFamilyIndex = srcQF;
    b.dstQueueFamilyIndex = dstQF;
    b.image               = image;
    b.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    b.subresourceRange.levelCount = 1;
    b.subresourceRange.layerCount = 1;
    vkCmdPipelineBarrier(cmd, srcStage, dstStage, 0, 0, nullptr, 0, nullptr, 1, &b);
}

void acquireFromExternal(VkCommandBuffer cmd, const Image& img,
                         uint32_t dstQueueFamily, VkAccessFlags dstAccess) {
    imageBarrier(cmd, img.handle(),
        VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, 0,
        VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, dstAccess,
        img.layout, img.layout,
        VK_QUEUE_FAMILY_EXTERNAL, dstQueueFamily);
}

void releaseToExternal(VkCommandBuffer cmd, const Image& img,
                       uint32_t srcQueueFamily, VkAccessFlags srcAccess) {
    imageBarrier(cmd, img.handle(),
        VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, srcAccess,
        VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT, 0,
        img.layout, img.layout,
        srcQueueFamily, VK_QUEUE_FAMILY_EXTERNAL);
}

} // namespace bionic_fg::vk
