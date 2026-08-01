#include "bionic_fg/session.hpp"

#include "logging.hpp"
#include "shaders_registry.hpp"

#include <chrono>
#include <sstream>

namespace bionic_fg {
namespace {

std::uint64_t nowMs() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

std::size_t countValidShaders() {
    std::size_t valid = 0;
    for (const auto& shader : embedded::kShaderRegistry) {
        if (embedded::IsValidSpirv(shader)) {
            ++valid;
        }
    }
    return valid;
}

} // namespace

Session::Session(Config config)
    : config_(config)
    , embeddedShaderCount_(EmbeddedShaderCount())
    , validShaderCount_(ValidEmbeddedShaderCount())
    , createdAtMs_(nowMs()) {
    config_.sanitize();
    readyForHostIntegration_ = embeddedShaderCount_ > 0 && embeddedShaderCount_ == validShaderCount_;
    BFG_LOGI(
        "Session bootstrap: %zushaders/%zu valid, multiplier=%u flowScale=%.2f model=%u ready=%s",
        validShaderCount_,
        embeddedShaderCount_,
        config_.multiplier,
        config_.flowScale,
        config_.model,
        readyForHostIntegration_ ? "true" : "false"
    );
}

void Session::updateConfig(Config config) {
    config_ = config;
    config_.sanitize();
}

std::string Session::describe() const {
    std::ostringstream out;
    out
        << "BionicFGSession{" 
        << "width=" << config_.width
        << ", height=" << config_.height
        << ", multiplier=" << config_.multiplier
        << ", flowScale=" << config_.flowScale
        << ", model=" << config_.model
        << ", shaders=" << validShaderCount_ << "/" << embeddedShaderCount_
        << ", readyForHostIntegration=" << (readyForHostIntegration_ ? "true" : "false")
        << ", createdAtMs=" << createdAtMs_
        << '}';
    return out.str();
}

std::size_t Session::EmbeddedShaderCount() {
    return embedded::kShaderRegistry.size();
}

std::size_t Session::ValidEmbeddedShaderCount() {
    static const std::size_t valid = countValidShaders();
    return valid;
}

std::string Session::DescribeEmbeddedBundle() {
    std::ostringstream out;
    out
        << "BionicFGEmbeddedBundle{" 
        << "shaderCount=" << EmbeddedShaderCount()
        << ", validShaderCount=" << ValidEmbeddedShaderCount();

    if (!embedded::kShaderRegistry.empty()) {
        const auto& first = embedded::kShaderRegistry.front();
        const auto& last = embedded::kShaderRegistry.back();
        out
            << ", first=\"" << first.name << "\""
            << ", last=\"" << last.name << "\"";
    }

    out << '}';
    return out.str();
}

} // namespace bionic_fg
