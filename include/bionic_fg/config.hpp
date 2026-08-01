#pragma once

#include <cstdint>

namespace bionic_fg {

struct Config {
    uint32_t width = 0;
    uint32_t height = 0;
    uint32_t multiplier = 2;
    float flowScale = 0.6f;
    uint32_t model = 0;

    void sanitize() {
        if (multiplier < 2) multiplier = 0;
        if (multiplier > 4) multiplier = 4;
        if (flowScale < 0.2f) flowScale = 0.2f;
        if (flowScale > 1.0f) flowScale = 1.0f;
        if (model > 1) model = 1;
    }
};

} // namespace bionic_fg
