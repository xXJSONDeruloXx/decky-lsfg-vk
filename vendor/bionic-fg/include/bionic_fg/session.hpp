#pragma once

#include "bionic_fg/config.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>

namespace bionic_fg {

class Session {
public:
    explicit Session(Config config);

    const Config& config() const { return config_; }
    void updateConfig(Config config);

    bool isReadyForHostIntegration() const { return readyForHostIntegration_; }
    std::size_t embeddedShaderCount() const { return embeddedShaderCount_; }
    std::size_t validShaderCount() const { return validShaderCount_; }

    std::string describe() const;

    static std::size_t EmbeddedShaderCount();
    static std::size_t ValidEmbeddedShaderCount();
    static std::string DescribeEmbeddedBundle();

private:
    Config config_;
    bool readyForHostIntegration_ = false;
    std::size_t embeddedShaderCount_ = 0;
    std::size_t validShaderCount_ = 0;
    std::uint64_t createdAtMs_ = 0;
};

using SessionPtr = std::unique_ptr<Session>;

} // namespace bionic_fg
