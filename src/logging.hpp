#pragma once

#ifdef __ANDROID__
#include <android/log.h>
#define BFG_LOGI(...) __android_log_print(ANDROID_LOG_INFO, "BionicFG", __VA_ARGS__)
#define BFG_LOGW(...) __android_log_print(ANDROID_LOG_WARN, "BionicFG", __VA_ARGS__)
#define BFG_LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "BionicFG", __VA_ARGS__)
#else
#include <cstdio>
#define BFG_LOGI(...) do { std::printf(__VA_ARGS__); std::printf("\n"); } while (0)
#define BFG_LOGW(...) do { std::printf(__VA_ARGS__); std::printf("\n"); } while (0)
#define BFG_LOGE(...) do { std::fprintf(stderr, __VA_ARGS__); std::fprintf(stderr, "\n"); } while (0)
#endif
