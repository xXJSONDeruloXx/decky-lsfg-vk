#include "framegen_context.hpp"
#include "logging.hpp"

#include <cmath>
#include <cstring>
#include <sstream>
#include <stdexcept>
#include <algorithm>
#include <array>
#include <cstdio>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace bionic_fg {

// ─── Pass ────────────────────────────────────────────────────────────────────

Pass::Pass(const vk::Device& dev,
           VkDescriptorPool descPool,
           int shaderIdx,
           const std::vector<vk::DescriptorBinding>& bindings) {
    if (shaderIdx < 0 || static_cast<size_t>(shaderIdx) >= embedded::kShaderRegistry.size())
        throw std::runtime_error("Pass: shader index out of range");
    const auto& blob = embedded::kShaderRegistry[static_cast<size_t>(shaderIdx)];
    if (!embedded::IsValidSpirv(blob))
        throw std::runtime_error(std::string("Pass: invalid SPIR-V for ") + blob.name);
    layout_   = vk::DescriptorSetLayout(dev, bindings);
    descSets_[0] = vk::DescriptorSet(dev, descPool, layout_.handle());
    descSets_[1] = vk::DescriptorSet(dev, descPool, layout_.handle());
    pipeline_ = vk::ComputePipeline(dev, blob.data, blob.size, layout_.handle());
    BFG_LOGI("Pass: loaded %s", blob.name);
}
void Pass::destroy(const vk::Device& dev) {
    pipeline_.destroy(dev);
    layout_.destroy(dev);
}
void Pass::bindUBO(const vk::Device& dev, uint32_t b, const vk::Buffer& buf) {
    for (auto& s : descSets_) s.bindUBO(dev, b, buf);
}
void Pass::bindSampled(const vk::Device& dev, uint32_t b, const vk::Image& img,
                       const vk::Sampler& sampler) {
    for (auto& s : descSets_)
        s.bindCombinedImageSampler(dev, b, img, sampler,
            img.external() ? VK_IMAGE_LAYOUT_GENERAL : VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL);
}
void Pass::bindSampledGeneral(const vk::Device& dev, uint32_t b, const vk::Image& img,
                              const vk::Sampler& sampler) {
    for (auto& s : descSets_)
        s.bindCombinedImageSampler(dev, b, img, sampler, VK_IMAGE_LAYOUT_GENERAL);
}
void Pass::bindStorage(const vk::Device& dev, uint32_t b, const vk::Image& img) {
    for (auto& s : descSets_) s.bindStorageImage(dev, b, img);
}
void Pass::bindSampledAt(const vk::Device& dev, uint32_t parity, uint32_t b,
                         const vk::Image& img, const vk::Sampler& sampler) {
    descSets_[parity & 1].bindCombinedImageSampler(dev, b, img, sampler,
        img.external() ? VK_IMAGE_LAYOUT_GENERAL : VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL);
}
void Pass::bindSampledGeneralAt(const vk::Device& dev, uint32_t parity, uint32_t b,
                                const vk::Image& img, const vk::Sampler& sampler) {
    descSets_[parity & 1].bindCombinedImageSampler(dev, b, img, sampler, VK_IMAGE_LAYOUT_GENERAL);
}
void Pass::dispatch(VkCommandBuffer cmd, uint32_t gx, uint32_t gy, uint32_t parity) const {
    pipeline_.bind(cmd);
    pipeline_.bindDescriptorSet(cmd, descSets_[parity & 1].handle());
    pipeline_.dispatch(cmd, gx, gy, 1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

static void computeBarrier(VkCommandBuffer cmd) {
    VkMemoryBarrier mb{};
    mb.sType         = VK_STRUCTURE_TYPE_MEMORY_BARRIER;
    mb.srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT;
    mb.dstAccessMask = VK_ACCESS_SHADER_READ_BIT | VK_ACCESS_SHADER_WRITE_BIT;
    vkCmdPipelineBarrier(cmd,
        VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
        VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
        0, 1, &mb, 0, nullptr, 0, nullptr);
}

static void toStorage(VkCommandBuffer cmd, vk::Image& img) {
    if (img.external() || img.layout == VK_IMAGE_LAYOUT_GENERAL) return;
    vk::imageBarrier(cmd, img.handle(),
        img.layout == VK_IMAGE_LAYOUT_UNDEFINED
            ? VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT : VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
        0,
        VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, VK_ACCESS_SHADER_WRITE_BIT,
        img.layout, VK_IMAGE_LAYOUT_GENERAL);
    img.layout = VK_IMAGE_LAYOUT_GENERAL;
}

static VkDescriptorPool makeDescPool(const vk::Device& dev, uint32_t maxSets) {
    VkDescriptorPoolSize sizes[3]{};
    sizes[0].type = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER;            sizes[0].descriptorCount = maxSets * 4;
    sizes[1].type = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;    sizes[1].descriptorCount = maxSets * 16;
    sizes[2].type = VK_DESCRIPTOR_TYPE_STORAGE_IMAGE;             sizes[2].descriptorCount = maxSets * 16;
    VkDescriptorPoolCreateInfo pci{};
    pci.sType         = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;
    pci.flags         = VK_DESCRIPTOR_POOL_CREATE_FREE_DESCRIPTOR_SET_BIT;
    pci.maxSets       = maxSets;
    pci.poolSizeCount = 3;
    pci.pPoolSizes    = sizes;
    VkDescriptorPool pool = VK_NULL_HANDLE;
    vkCreateDescriptorPool(dev.handle(), &pci, nullptr, &pool);
    return pool;
}

static constexpr uint32_t kDbgProbeTexels = 64;
static constexpr uint32_t kDbgProbeSpots  = 4;   // sample locations per field
static constexpr uint32_t kDbgProbeFields = 3;   // d089/d094/d099.b48

static float halfToFloat(uint16_t h) {
    const uint32_t sign = (uint32_t(h) & 0x8000u) << 16;
    uint32_t exp  = (h >> 10) & 0x1f;
    uint32_t mant = h & 0x3ffu;
    uint32_t bits;
    if (exp == 0) {
        if (mant == 0) { bits = sign; }
        else {
            exp = 127 - 15 + 1;
            while (!(mant & 0x400u)) { mant <<= 1; --exp; }
            mant &= 0x3ffu;
            bits = sign | (exp << 23) | (mant << 13);
        }
    } else if (exp == 31) {
        bits = sign | 0x7f800000u | (mant << 13);
    } else {
        bits = sign | ((exp - 15 + 127) << 23) | (mant << 13);
    }
    float f;
    std::memcpy(&f, &bits, sizeof(f));
    return f;
}

static Pass makeModel1Pass(const vk::Device& dev,
                           VkDescriptorPool pool,
                           int shaderIdx,
                           const vk::Buffer* ubo,
                           const std::vector<const vk::Image*>& sampled,
                           const vk::Sampler& sampler,
                           const std::vector<vk::Image*>& storage) {
    std::vector<vk::DescriptorBinding> binds;
    binds.reserve((ubo ? 1u : 0u) + sampled.size() + storage.size());
    if (ubo) binds.push_back({0, VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER, 1});
    for (uint32_t i = 0; i < sampled.size(); ++i)
        binds.push_back({32u + i, VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, 1});
    for (uint32_t i = 0; i < storage.size(); ++i)
        binds.push_back({48u + i, VK_DESCRIPTOR_TYPE_STORAGE_IMAGE, 1});

    Pass p(dev, pool, shaderIdx, binds);
    if (ubo) p.bindUBO(dev, 0, *ubo);
    for (uint32_t i = 0; i < sampled.size(); ++i)
        p.bindSampledGeneral(dev, 32u + i, *sampled[i], sampler);
    for (uint32_t i = 0; i < storage.size(); ++i)
        p.bindStorage(dev, 48u + i, *storage[i]);
    return p;
}

// ─── FramegenContext::create ─────────────────────────────────────────────────

#ifdef __ANDROID__
std::unique_ptr<FramegenContext> FramegenContext::create(
        const vk::Device& device,
        uint32_t provisionedOutputs,
        VkExtent2D extent, VkFormat format, const Config& cfg) {
    return create(device, nullptr, nullptr,
                  std::vector<AHardwareBuffer*>(provisionedOutputs, nullptr),
                  extent, format, cfg);
}

std::unique_ptr<FramegenContext> FramegenContext::create(
        const vk::Device& device,
        AHardwareBuffer* prevAhb, AHardwareBuffer* currAhb,
        const std::vector<AHardwareBuffer*>& outputAhbs,
        VkExtent2D extent, VkFormat format, const Config& cfg) {
    if ((prevAhb != nullptr) != (currAhb != nullptr) || outputAhbs.empty()) {
        BFG_LOGE("FramegenContext::create: mismatched input AHBs or empty outputs");
        return nullptr;
    }
    auto ctx = std::make_unique<FramegenContext>();
    ctx->cfg_ = cfg; ctx->cfg_.sanitize();
    ctx->extent_ = extent; ctx->format_ = format;
    ctx->prevAhbPtr_ = prevAhb;
    ctx->currAhbPtr_ = currAhb;
    const uint32_t W = extent.width, H = extent.height;
    const uint32_t outputs = ctx->cfg_.multiplier - 1;

    try {
        const bool useModel1 = ctx->cfg_.model == 1;
        const int N = useModel1 ? 4 : 2;

        // Single-device mode: adopt the application's device (not owned) instead
        // of spinning up a standalone instance/device. All vk:: helpers call
        // global vkXxx routed by handle, and the layer hooks none of the
        // functions they use, so they operate on the app device with no
        // recursion — and the AHB producer/consumer are now one device, so the
        // sync that previously deadlocked across two devices resolves.
        ctx->device_        = device;
        ctx->cmdPool_       = vk::CommandPool(ctx->device_);
        ctx->linearSampler_ = vk::Sampler(ctx->device_, VK_FILTER_LINEAR,
                                           VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER);
        ctx->nearestSampler_= vk::Sampler(ctx->device_, VK_FILTER_NEAREST,
                                           VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE);
        ctx->descPool_ = makeDescPool(ctx->device_, 300);

        // ── Frame input/output images (AHB-backed or device-local) ─────────
        vk::ImageInfo ahbInfo;
        ahbInfo.extent = extent; ahbInfo.format = format;
        ahbInfo.usage  = VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_SAMPLED_BIT
                       | VK_IMAGE_USAGE_TRANSFER_SRC_BIT
                       | VK_IMAGE_USAGE_TRANSFER_DST_BIT;
        ctx->prevFrame_ = prevAhb ? vk::Image(ctx->device_, ahbInfo, prevAhb)
                                  : vk::Image(ctx->device_, ahbInfo);
        ctx->currFrame_ = currAhb ? vk::Image(ctx->device_, ahbInfo, currAhb)
                                  : vk::Image(ctx->device_, ahbInfo);
        ctx->outputImages_.reserve(outputAhbs.size());
        for (auto* ahb : outputAhbs)
            ctx->outputImages_.emplace_back(
                ahb ? vk::Image(ctx->device_, ahbInfo, ahb)
                    : vk::Image(ctx->device_, ahbInfo));

        if (!useModel1)
            ctx->dbgFlowBuf_ = vk::Buffer(ctx->device_, kDbgProbeTexels * 8u * kDbgProbeFields,
                                          VK_BUFFER_USAGE_TRANSFER_DST_BIT);

        // ── UBOs ──────────────────────────────────────────────────────────
        PyramidUBO pyubo; pyubo.scale=2; pyubo.aspect=W/std::max(1u,H); pyubo.pad0=0; pyubo.pad1=0;
        ctx->uboPyramid_ = vk::Buffer(ctx->device_, sizeof(PyramidUBO),
                                       VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, &pyubo);
        FlowUBO fubo; fubo.flowScale=cfg.flowScale; fubo.pad0=fubo.pad1=fubo.pad2=0;
        ctx->uboFlow_ = vk::Buffer(ctx->device_, sizeof(FlowUBO),
                                    VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, &fubo);
        ctx->uboSynth_.reserve(outputs);
        for (uint32_t k = 0; k < outputs; ++k) {
            SynthUBO s;
            s.flowScale = cfg.flowScale;
            s.alpha     = float(k+1) / float(cfg.multiplier);
            s.epsilon   = 1e-5f;
            ctx->uboSynth_.emplace_back(ctx->device_, sizeof(SynthUBO),
                                         VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, &s);
        }

        // ── Shared graph ───────────────────────────────────────────────────
        // The reference implementation owns more persistent/history resources
        // than an implicit layer can see directly. The compute side still needs
        // to match the observed dispatch/resource graph: 99 internal dispatches
        // (shader_03 then the per-slot table) plus final shader_04 per
        // generated output. Descriptor labels below follow the traced
        // descriptor-edge map. The graph is written in model-1 shader indices;
        // shaderForModel swaps in the model-0 shader per slot, and N is the
        // per-model feature width.
        {
            struct Ratio { uint32_t num; uint32_t den; };
            auto ratio = [](uint32_t num, uint32_t den) { return Ratio{num, den}; };
            auto extentFor = [&](Ratio r) -> VkExtent2D {
                const uint32_t ew = std::max(1u, static_cast<uint32_t>((uint64_t(W) * r.num + r.den - 1u) / r.den));
                const uint32_t eh = std::max(1u, static_cast<uint32_t>((uint64_t(H) * r.num + r.den - 1u) / r.den));
                return {ew, eh};
            };
            auto groupsFor = [&](Ratio r) -> VkExtent2D {
                VkExtent2D e = extentFor(r);
                return {std::max(1u, (e.width + 15u) / 16u),
                        std::max(1u, (e.height + 15u) / 16u)};
            };
            auto dLabel = [](int dispatch, int binding) -> std::string {
                char buf[16];
                std::snprintf(buf, sizeof(buf), "d%03d.b%d", dispatch, binding);
                return std::string(buf);
            };
            auto extLabel = [](int ext) -> std::string {
                char buf[16];
                std::snprintf(buf, sizeof(buf), "ext%d", ext);
                return std::string(buf);
            };
            auto dLabels = [&](int dispatch, int firstBinding, int count) {
                std::vector<std::string> out;
                out.reserve(static_cast<size_t>(count));
                for (int i = 0; i < count; ++i) out.push_back(dLabel(dispatch, firstBinding + i));
                return out;
            };
            auto extLabels = [&](int firstExt, int count) {
                std::vector<std::string> out;
                out.reserve(static_cast<size_t>(count));
                for (int i = 0; i < count; ++i) out.push_back(extLabel(firstExt + i));
                return out;
            };
            auto append = [](std::vector<std::string>& dst, std::vector<std::string> src) {
                dst.insert(dst.end(), src.begin(), src.end());
            };

            // Slots 13..24 map -24, not -25: shader_17 sits out of sequence
            // in the model-0-only slot 25.
            auto shaderForModel = [&](int s) {
                if (useModel1)            return s;
                if (s >= 30 && s <= 41)   return s - 25;   // slots 1..12
                if (s >= 42 && s <= 53)   return s - 24;   // slots 13..24
                return s;                                  // slots 0 and 26
            };

            auto storageFormatForShader = [](int shaderIdx) -> VkFormat {
                switch (shaderIdx) {
                    case 3:
                    case 38:
                        return VK_FORMAT_R8_UNORM;
                    case 43:
                    case 48:
                    case 53:
                        return VK_FORMAT_R16G16B16A16_SFLOAT;
                    default:
                        return VK_FORMAT_R8G8B8A8_UNORM;
                }
            };
            auto uboForShader = [&](int shaderIdx) -> const vk::Buffer* {
                switch (shaderIdx) {
                    case 3:
                        return &ctx->uboPyramid_;
                    case 38:
                    case 39:
                    case 43:
                    case 44:
                    case 48:
                    case 49:
                        return &ctx->uboFlow_;
                    default:
                        return nullptr;
                }
            };

            ctx->model1Resources_.reserve(320);
            std::unordered_map<std::string, size_t> resourceIndex;
            auto allocateResource = [&](const std::string& label, VkFormat fmt, VkExtent2D e) -> vk::Image& {
                auto found = resourceIndex.find(label);
                if (found != resourceIndex.end()) return ctx->model1Resources_[found->second];
                vk::ImageInfo info;
                info.extent = e;
                info.format = fmt;
                info.usage  = VK_IMAGE_USAGE_STORAGE_BIT | VK_IMAGE_USAGE_SAMPLED_BIT;
                if (!useModel1 && (label == dLabel(89, 48) || label == dLabel(94, 48) ||
                                   label == dLabel(99, 48)))
                    info.usage |= VK_IMAGE_USAGE_TRANSFER_SRC_BIT;
                const size_t idx = ctx->model1Resources_.size();
                ctx->model1Resources_.emplace_back(ctx->device_, info);
                resourceIndex.emplace(label, idx);
                return ctx->model1Resources_.back();
            };
            auto resourceForD = [&](const std::string& label) -> vk::Image& {
                return ctx->model1Resources_[resourceIndex.at(label)];
            };

            // Most extN labels are persistent/history resources from the traced
            // native graph. In the implicit-layer adaptation we feed matching
            // current-frame graph products instead; ext1/ext35 remain the real
            // curr/prev frame pair used by shader_03 and final shader_04.
            auto mappedExternalLabel = [&](int ext) -> std::string {
                if (ext >= 2 && ext <= 5)   return dLabel(23, 48 + (ext - 2));
                if (ext >= 6 && ext <= 9)   return dLabel(23, 48 + (ext - 6));
                if (ext >= 10 && ext <= 13) return dLabel(29, 48 + (ext - 10));
                if (ext == 14)              return dLabel(34, 53);
                if (ext >= 15 && ext <= 18) return dLabel(28, 48 + (ext - 15));
                if (ext >= 19 && ext <= 22) return dLabel(27, 48 + (ext - 19));
                if (ext >= 23 && ext <= 26) return dLabel(26, 48 + (ext - 23));
                if (ext >= 27 && ext <= 30) return dLabel(25, 48 + (ext - 27));
                if (ext >= 31 && ext <= 34) return dLabel(24, 48 + (ext - 31));
                return dLabel(23, 48);
            };
            auto resolveSample = [&](const std::string& label) -> const vk::Image* {
                if (label.rfind("ext", 0) == 0) {
                    const int ext = std::stoi(label.substr(3));
                    if (ext == 1)  return &ctx->currFrame_;
                    if (ext == 35) return &ctx->prevFrame_;
                    return &resourceForD(mappedExternalLabel(ext));
                }
                return &resourceForD(label);
            };

            auto addPass = [&](int shaderIdx,
                               Ratio passRatio,
                               const std::vector<std::string>& sampledLabels,
                               const std::vector<std::string>& storageLabels,
                               const std::vector<Ratio>& storageRatios) {
                const VkFormat fmt = storageFormatForShader(shaderIdx);
                std::vector<vk::Image*> storage;
                storage.reserve(storageLabels.size());
                for (size_t i = 0; i < storageLabels.size(); ++i) {
                    const Ratio r = storageRatios.empty() ? passRatio : storageRatios[i];
                    storage.push_back(&allocateResource(storageLabels[i], fmt, extentFor(r)));
                }

                std::vector<const vk::Image*> sampled;
                sampled.reserve(sampledLabels.size());
                for (const auto& label : sampledLabels) sampled.push_back(resolveSample(label));

                ctx->model1GraphPasses_.push_back(
                    makeModel1Pass(ctx->device_, ctx->descPool_, shaderForModel(shaderIdx),
                                   uboForShader(shaderIdx),
                                   sampled, ctx->linearSampler_, storage));
                ctx->model1GraphDispatch_.push_back(groupsFor(passRatio));
                std::vector<VkImage> reads; reads.reserve(sampled.size());
                for (const auto* s : sampled) reads.push_back(s->handle());
                std::vector<VkImage> writes; writes.reserve(storage.size());
                for (const auto* s : storage) writes.push_back(s->handle());
                ctx->model1Reads_.push_back(std::move(reads));
                ctx->model1Writes_.push_back(std::move(writes));
            };

            const std::vector<Ratio> pyramidOut = {
                ratio(1,5), ratio(1,10), ratio(1,20), ratio(1,40),
                ratio(1,80), ratio(1,160), ratio(1,320),
            };
            const std::array<Ratio, 7> expandRatios = {{
                ratio(2,5), ratio(1,5), ratio(1,10), ratio(1,20),
                ratio(1,40), ratio(1,80), ratio(1,160),
            }};
            const std::array<Ratio, 7> smallRatios = {{
                ratio(1,5), ratio(1,10), ratio(1,20), ratio(1,40),
                ratio(1,80), ratio(1,160), ratio(1,320),
            }};

            // 0x1a9ed4: shader_03, shader_30 x7, shader_31 x7,
            // shader_32 x7, shader_33 x7.
            addPass(3, ratio(1,5), {extLabel(1)}, dLabels(1, 48, 7), pyramidOut);
            for (int i = 0; i < 7; ++i)
                addPass(30, expandRatios[size_t(i)], {dLabel(1, 48 + i)}, dLabels(2 + i, 48, 2), {});
            for (int i = 0; i < 7; ++i)
                addPass(31, expandRatios[size_t(i)], dLabels(2 + i, 48, 2), dLabels(9 + i, 48, 2), {});
            for (int i = 0; i < 7; ++i)
                addPass(32, smallRatios[size_t(i)], dLabels(9 + i, 48, 2), dLabels(16 + i, 48, N), {});
            for (int i = 0; i < 7; ++i)
                addPass(33, smallRatios[size_t(i)], dLabels(16 + i, 48, N), dLabels(23 + i, 48, N), {});

            // 0x1b004c: shader_34..38.
            {
                auto sampled = extLabels(2, N);
                append(sampled, extLabels(6, N));
                append(sampled, dLabels(23, 48, N));
                addPass(34, ratio(1,5), sampled, dLabels(30, 48, 2), {});
            }
            addPass(35, ratio(1,5), dLabels(30, 48, 2), dLabels(31, 48, 2), {});
            addPass(36, ratio(1,5), dLabels(31, 48, 2), dLabels(32, 48, 2), {});
            addPass(37, ratio(1,5), dLabels(32, 48, 2), dLabels(33, 48, 2), {});
            addPass(38, ratio(1,10), dLabels(33, 48, 2), dLabels(34, 48, 6), {
                ratio(1,10), ratio(1,20), ratio(1,40), ratio(1,80), ratio(1,160), ratio(1,320)
            });

            auto addFivePassRound = [&](Ratio r, int extStart, int srcD,
                                        const std::string& carry, const std::string& aux,
                                        int firstDispatch) {
                auto sampled39 = extLabels(extStart, N);
                append(sampled39, dLabels(srcD, 48, N));
                sampled39.push_back(carry);
                addPass(39, r, sampled39, dLabels(firstDispatch, 48, 3), {});
                addPass(40, r, dLabels(firstDispatch, 48, 3), dLabels(firstDispatch + 1, 48, 4), {});
                addPass(41, r, dLabels(firstDispatch + 1, 48, 4), dLabels(firstDispatch + 2, 48, 4), {});
                addPass(42, r, dLabels(firstDispatch + 2, 48, 4), dLabels(firstDispatch + 3, 48, 4), {});
                auto sampled43 = dLabels(firstDispatch + 3, 48, 4);
                sampled43.push_back(carry);
                sampled43.push_back(aux);
                addPass(43, r, sampled43, dLabels(firstDispatch + 4, 48, 1), {});
            };

            // 0x1b0708: three 1x1 rounds plus one 2x2 round using shader_39..43.
            addFivePassRound(ratio(1,320), 10, 29, extLabel(14),      dLabel(34, 53), 35);
            addFivePassRound(ratio(1,160), 15, 28, dLabel(39, 48),   dLabel(34, 53), 40);
            addFivePassRound(ratio(1,80),  19, 27, dLabel(44, 48),   dLabel(34, 52), 45);
            addFivePassRound(ratio(1,40),  23, 26, dLabel(49, 48),   dLabel(34, 51), 50);

            auto addFifteenPassRound = [&](Ratio r, int extStart, int srcD,
                                           const std::string& carry,
                                           const std::string& aux,
                                           const std::string& shader49Extra,
                                           const std::string& shader53Extra,
                                           int firstDispatch) {
                addFivePassRound(r, extStart, srcD, carry, aux, firstDispatch);

                auto sampled44 = extLabels(extStart, N);
                append(sampled44, dLabels(srcD, 48, N));
                sampled44.push_back(carry);
                addPass(44, r, sampled44, dLabels(firstDispatch + 5, 48, 3), {});
                addPass(45, r, dLabels(firstDispatch + 5, 48, 3), dLabels(firstDispatch + 6, 48, 4), {});
                addPass(46, r, dLabels(firstDispatch + 6, 48, 4), dLabels(firstDispatch + 7, 48, 4), {});
                addPass(47, r, dLabels(firstDispatch + 7, 48, 4), dLabels(firstDispatch + 8, 48, 4), {});
                auto sampled48 = dLabels(firstDispatch + 8, 48, 4);
                sampled48.push_back(carry);
                sampled48.push_back(aux);
                addPass(48, r, sampled48, dLabels(firstDispatch + 9, 48, 1), {});

                auto sampled49 = extLabels(extStart, N);
                append(sampled49, dLabels(srcD, 48, N));
                sampled49.push_back(carry);
                sampled49.push_back(shader49Extra);
                addPass(49, r, sampled49, dLabels(firstDispatch + 10, 48, 2), {});
                addPass(50, r, dLabels(firstDispatch + 10, 48, 2), dLabels(firstDispatch + 11, 48, 2), {});
                addPass(51, r, dLabels(firstDispatch + 11, 48, 2), dLabels(firstDispatch + 12, 48, 2), {});
                addPass(52, r, dLabels(firstDispatch + 12, 48, 2), dLabels(firstDispatch + 13, 48, 2), {});
                auto sampled53 = dLabels(firstDispatch + 13, 48, 2);
                sampled53.push_back(shader53Extra);
                addPass(53, r, sampled53, dLabels(firstDispatch + 14, 48, 1), {});
            };

            addFifteenPassRound(ratio(1,20), 27, 25, dLabel(54, 48), dLabel(34, 50),
                                extLabel(14), extLabel(14), 55);
            addFifteenPassRound(ratio(1,10), 31, 24, dLabel(59, 48), dLabel(34, 49),
                                dLabel(64, 48), dLabel(69, 48), 70);
            addFifteenPassRound(ratio(1,5), 6, 23, dLabel(74, 48), dLabel(34, 48),
                                dLabel(79, 48), dLabel(84, 48), 85);

            // Final full-resolution shader_04. The traced native path then
            // performs a barrier/copy/barrier in 0x1b1b10; as a layer we bind
            // the storage output directly to the generated AHB image and let
            // layer.cpp blit it into swapchain images.
            ctx->model1FinalPassStart_ = ctx->model1GraphPasses_.size();
            for (uint32_t k = 0; k < outputs; ++k) {
                std::vector<const vk::Image*> sampled = {
                    &ctx->prevFrame_,
                    &ctx->currFrame_,
                    &resourceForD(dLabel(89, 48)),
                    &resourceForD(dLabel(94, 48)),
                    &resourceForD(dLabel(99, 48)),
                };
                std::vector<vk::Image*> storage = {&ctx->outputImages_[k]};
                ctx->model1GraphPasses_.push_back(
                    makeModel1Pass(ctx->device_, ctx->descPool_, 4, &ctx->uboSynth_[k],
                                   sampled, ctx->linearSampler_, storage));
                ctx->model1GraphDispatch_.push_back(groupsFor(ratio(1,1)));
                std::vector<VkImage> reads; reads.reserve(sampled.size());
                for (const auto* s : sampled) reads.push_back(s->handle());
                ctx->model1Reads_.push_back(std::move(reads));
                ctx->model1Writes_.push_back({ctx->outputImages_[k].handle()});
            }

            ctx->dbgFlowIdx_[0] = resourceIndex.at(dLabel(89, 48));
            ctx->dbgFlowIdx_[1] = resourceIndex.at(dLabel(94, 48));
            ctx->dbgFlowIdx_[2] = resourceIndex.at(dLabel(99, 48));

            BFG_LOGI("model=%u graph: %zu passes, %zu resources, finalStart=%zu",
                     ctx->cfg_.model, ctx->model1GraphPasses_.size(),
                     ctx->model1Resources_.size(), ctx->model1FinalPassStart_);
        }


        // ── Frame ring ────────────────────────────────────────────────────────
        for (auto& f : ctx->frames_) {
            f.cmd   = vk::CommandBuffer(ctx->device_, ctx->cmdPool_);
            f.fence = vk::Fence(ctx->device_, true);
        }

        BFG_LOGI("FramegenContext ready: %ux%u mult=%u model=%u graph=shared-table N=%d",
                  W, H, cfg.multiplier, cfg.model, N);
        return ctx;
    } catch (const vk::VkError& e) {
        BFG_LOGE("FramegenContext::create VkError %d: %s", e.code, e.msg.c_str());
        ctx->destroy();
        return nullptr;
    } catch (const std::exception& e) {
        BFG_LOGE("FramegenContext::create exception: %s", e.what());
        ctx->destroy();
        return nullptr;
    }
}

void FramegenContext::rebindFrameInputs() {
    // Only the parity set of the NEXT run is written; the other set may be in
    // use by the in-flight graph. That parity's last user was the run two
    // frames back — its fence gates the update (signalled long ago in steady
    // state).
    const uint32_t p = frameIdx_ & 1u;
    frames_[p].fence.wait(device_);
    if (!model1GraphPasses_.empty())
        model1GraphPasses_[0].bindSampledGeneralAt(device_, p, 32, currFrame_, linearSampler_); // shader_03 ext1
    for (size_t i = model1FinalPassStart_; i < model1GraphPasses_.size(); ++i) {
        model1GraphPasses_[i].bindSampledGeneralAt(device_, p, 32, prevFrame_, linearSampler_); // shader_04 ext35
        model1GraphPasses_[i].bindSampledGeneralAt(device_, p, 33, currFrame_, linearSampler_); // shader_04 ext1
    }
}

void FramegenContext::swapFrameInputs() {
    std::swap(prevFrame_, currFrame_);
    std::swap(prevAhbPtr_, currAhbPtr_);
    rebindFrameInputs();
}

void FramegenContext::present(AHardwareBuffer* newPrev, AHardwareBuffer* newCurr) {
    if (newPrev && newCurr && (newPrev != prevAhbPtr_ || newCurr != currAhbPtr_)) {
        if (newPrev == currAhbPtr_ && newCurr == prevAhbPtr_) {
            swapFrameInputs();
        } else {
            BFG_LOGW("FramegenContext::present: unexpected AHB input order; using existing descriptors");
        }
    }

    const uint32_t W  = extent_.width,  H  = extent_.height;
    const uint32_t fi = frameIdx_ & 1u;
    auto& fr = frames_[fi];
    fr.fence.wait(device_); fr.fence.reset(device_);

    // Decode the flow probe written by the run this fence just retired.
    if (cfg_.model != 1 && dbgFlowBuf_.valid() && frameIdx_ >= 2 &&
        ++dbgLogCounter_ >= 120) {
        dbgLogCounter_ = 0;
        const auto* halves = static_cast<const uint16_t*>(dbgFlowBuf_.mapped());
        if (halves) {
            static const char* kName[kDbgProbeFields] = {"d089", "d094", "d099"};
            for (uint32_t f = 0; f < kDbgProbeFields; ++f) {
                const uint16_t* t = halves + size_t(f) * kDbgProbeTexels * 4u;
                float avg = 0.f, mx = 0.f, sgn[4] = {0.f, 0.f, 0.f, 0.f};
                for (uint32_t i = 0; i < kDbgProbeTexels; ++i) {
                    float c[4];
                    for (int j = 0; j < 4; ++j) {
                        c[j] = halfToFloat(t[i*4+uint32_t(j)]);
                        sgn[j] += c[j];
                    }
                    const float x = std::fabs(c[0]), y = std::fabs(c[1]);
                    avg += (x + y) * 0.5f;
                    mx = std::max(mx, std::max(x, y));
                }
                avg /= float(kDbgProbeTexels);
                for (int j = 0; j < 4; ++j) sgn[j] /= float(kDbgProbeTexels);
                BFG_LOGI("model0 flow %s: avg|xy|=%.3f max=%.2f xy=(%+.2f,%+.2f) zw=(%+.2f,%+.2f)",
                         kName[f], double(avg), double(mx),
                         double(sgn[0]), double(sgn[1]), double(sgn[2]), double(sgn[3]));
            }
        }
    }

    vkResetCommandBuffer(fr.cmd.handle(), 0);
    fr.cmd.begin();
    VkCommandBuffer cmd = fr.cmd.handle();

    // Order this run against the previous run's writes to the shared
    // intermediates AND the layer's transfer-stage blits of the outputs: runs
    // overlap on the queue now that nothing CPU-waits between them, and the
    // layout-elision below can otherwise start dispatching with no barrier
    // against the prior run's tail or the output blit's reads.
    {
        VkMemoryBarrier mb{};
        mb.sType         = VK_STRUCTURE_TYPE_MEMORY_BARRIER;
        mb.srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT | VK_ACCESS_TRANSFER_WRITE_BIT;
        mb.dstAccessMask = VK_ACCESS_SHADER_READ_BIT | VK_ACCESS_SHADER_WRITE_BIT;
        vkCmdPipelineBarrier(cmd,
            VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT | VK_PIPELINE_STAGE_TRANSFER_BIT,
            VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
            0, 1, &mb, 0, nullptr, 0, nullptr);
    }

    // Acquire AHB inputs from external; device-local inputs are moved to
    // GENERAL, the layout the sampled-image descriptors were recorded with
    if (prevFrame_.external()) vk::acquireFromExternal(cmd, prevFrame_, device_.computeFamily(), VK_ACCESS_SHADER_READ_BIT);
    else                       toStorage(cmd, prevFrame_);
    if (currFrame_.external()) vk::acquireFromExternal(cmd, currFrame_, device_.computeFamily(), VK_ACCESS_SHADER_READ_BIT);
    else                       toStorage(cmd, currFrame_);

    // Runtime-confirmed steady-state order (shared by both models):
    // 0x1a9ed4 -> 0x1afe28(no compute) -> 0x1b004c -> 0x1b0708
    // -> 0x1b1b10(copy/barrier). We emit the internal dispatch graph plus
    // the active final shader_04 passes directly into the provisioned AHB
    // outputs required by the current multiplier.
    const size_t activeOutputs = std::min<size_t>(
        outputImages_.size(),
        cfg_.multiplier > 1 ? static_cast<size_t>(cfg_.multiplier - 1) : size_t{0});

    for (auto& img : model1Resources_) toStorage(cmd, img);
    for (size_t i = 0; i < activeOutputs; ++i) {
        auto& out = outputImages_[i];
        if (out.external())
            vk::acquireFromExternal(cmd, out, device_.computeFamily(), VK_ACCESS_SHADER_WRITE_BIT);
        toStorage(cmd, out);
    }

    // Dispatch with barriers only at true dependencies. A barrier is
    // required when a pass reads or writes an image written since the last
    // barrier (RAW/WAW), or writes an image read since it (WAR); anything
    // else may overlap. The unconditional barrier-per-dispatch replay cost
    // ~100 pipeline drains per frame and dominated the graph's GPU time.
    const size_t passCount = std::min(model1GraphPasses_.size(), model1GraphDispatch_.size());
    std::unordered_set<VkImage> dirty, readSince;
    for (size_t i = 0; i < passCount; ++i) {
        bool needBarrier = false;
        if (i < model1Reads_.size() && i < model1Writes_.size()) {
            for (VkImage r : model1Reads_[i])
                if (dirty.count(r)) { needBarrier = true; break; }
            if (!needBarrier)
                for (VkImage w : model1Writes_[i])
                    if (dirty.count(w) || readSince.count(w)) { needBarrier = true; break; }
        } else {
            needBarrier = true;   // no dependency info; stay conservative
        }
        if (needBarrier) {
            computeBarrier(cmd);
            dirty.clear();
            readSince.clear();
        }
        const VkExtent2D g = model1GraphDispatch_[i];
        model1GraphPasses_[i].dispatch(cmd, g.width, g.height, fi);
        if (i < model1Reads_.size() && i < model1Writes_.size()) {
            for (VkImage r : model1Reads_[i]) readSince.insert(r);
            for (VkImage w : model1Writes_[i]) dirty.insert(w);
        }
    }
    // Make the final synthesis writes visible to the layer's blit
    computeBarrier(cmd);

    // Flow probe (model 0): the three flow fields shader_04 consumes
    // (rgba16f at 1/5), four spread sample spots each. Next run's opening
    // barrier includes the TRANSFER stage, ordering these reads against its
    // rewrites.
    if (cfg_.model != 1 && dbgFlowBuf_.valid() &&
        dbgFlowIdx_[0] < model1Resources_.size() &&
        dbgFlowIdx_[1] < model1Resources_.size() &&
        dbgFlowIdx_[2] < model1Resources_.size()) {
        const uint32_t fw = std::max(1u, (W + 4u) / 5u);
        const uint32_t fh = std::max(1u, (H + 4u) / 5u);
        const uint32_t run = kDbgProbeTexels / kDbgProbeSpots;
        for (int f = 0; f < 3; ++f) {
            vk::Image& img = model1Resources_[dbgFlowIdx_[f]];
            vk::imageBarrier(cmd, img.handle(),
                VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, VK_ACCESS_SHADER_WRITE_BIT,
                VK_PIPELINE_STAGE_TRANSFER_BIT, VK_ACCESS_TRANSFER_READ_BIT,
                VK_IMAGE_LAYOUT_GENERAL, VK_IMAGE_LAYOUT_GENERAL);
            VkBufferImageCopy regions[kDbgProbeSpots]{};
            uint32_t count = 0;
            for (uint32_t s = 0; s < kDbgProbeSpots; ++s) {
                const uint32_t px = fw * (s + 1u) / (kDbgProbeSpots + 1u);
                const uint32_t py = fh * (s + 1u) / (kDbgProbeSpots + 1u);
                if (px + run > fw || py >= fh) continue;
                auto& r = regions[count++];
                r.bufferOffset     = VkDeviceSize(f) * kDbgProbeTexels * 8u
                                   + VkDeviceSize(s) * run * 8u;
                r.imageSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
                r.imageOffset      = {int32_t(px), int32_t(py), 0};
                r.imageExtent      = {run, 1, 1};
            }
            if (count)
                vkCmdCopyImageToBuffer(cmd, img.handle(), VK_IMAGE_LAYOUT_GENERAL,
                                       dbgFlowBuf_.handle(), count, regions);
        }
    }

    for (size_t i = 0; i < activeOutputs; ++i) {
        auto& out = outputImages_[i];
        if (out.external())
            vk::releaseToExternal(cmd, out, device_.computeFamily(), VK_ACCESS_SHADER_WRITE_BIT);
    }
    if (prevFrame_.external()) vk::releaseToExternal(cmd, prevFrame_, device_.computeFamily(), VK_ACCESS_SHADER_READ_BIT);
    if (currFrame_.external()) vk::releaseToExternal(cmd, currFrame_, device_.computeFamily(), VK_ACCESS_SHADER_READ_BIT);

    fr.cmd.end();
    fr.cmd.submit(device_, fr.fence.handle());
    frameIdx_++;
}

#endif // __ANDROID__

void FramegenContext::updateConfig(const Config& cfg) {
    Config next = cfg; next.sanitize();
    // The UBOs are read by up to two in-flight runs; only touch them when a
    // value actually changed, and drain the queue first when it did.
    if (next.flowScale == cfg_.flowScale && next.multiplier == cfg_.multiplier &&
        next.model == cfg_.model) {
        cfg_ = next;
        return;
    }
    waitIdle();
    cfg_ = next;
    for (size_t k=0;k<uboSynth_.size();++k) {
        SynthUBO s;
        s.flowScale = cfg_.flowScale;
        s.alpha=float(k+1)/float(cfg_.multiplier); s.epsilon=1e-5f;
        uboSynth_[k].write(device_,&s,sizeof(s));
    }
    FlowUBO f; f.flowScale=cfg_.flowScale; f.pad0=f.pad1=f.pad2=0;
    uboFlow_.write(device_,&f,sizeof(f));
}

void FramegenContext::waitIdle() {
    if (device_.valid()) vkQueueWaitIdle(device_.computeQueue());
}

void FramegenContext::destroy() {
    waitIdle();
    for (auto& f:frames_) { f.cmd.destroy(device_,cmdPool_); f.fence.destroy(device_); }
    for (auto& p:model1GraphPasses_) p.destroy(device_); model1GraphPasses_.clear();
    model1GraphDispatch_.clear();
    model1Reads_.clear();
    model1Writes_.clear();
    model1FinalPassStart_ = 0;
    uboPyramid_.destroy(device_); uboFlow_.destroy(device_);
    dbgFlowBuf_.destroy(device_);
    for (auto& b:uboSynth_) b.destroy(device_); uboSynth_.clear();
    // Images
    prevFrame_.destroy(device_); currFrame_.destroy(device_);
    for (auto& i:outputImages_) i.destroy(device_); outputImages_.clear();
    for (auto& i:model1Resources_) i.destroy(device_); model1Resources_.clear();
    if (descPool_) vkDestroyDescriptorPool(device_.handle(), descPool_, nullptr);
    descPool_ = VK_NULL_HANDLE;
    linearSampler_.destroy(device_); nearestSampler_.destroy(device_);
    cmdPool_.destroy(device_); device_.destroy();
}

std::string FramegenContext::describe() const {
    std::ostringstream o;
    o << "FramegenContext{" << extent_.width << "x" << extent_.height
      << " mult=" << cfg_.multiplier << " flowScale=" << cfg_.flowScale
      << " model=" << cfg_.model << " valid=" << (valid()?"true":"false") << "}";
    return o.str();
}

} // namespace bionic_fg
