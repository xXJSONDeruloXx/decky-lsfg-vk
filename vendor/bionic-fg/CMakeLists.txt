cmake_minimum_required(VERSION 3.22.1)

project(bionic_fg LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(BIONIC_FG_SOURCES
    src/session.cpp
    src/vulkan/vk_impl.cpp
    src/framegen_context.cpp
    src/vk_layer/layer.cpp
)

if(ANDROID)
    find_library(ANDROID_LIBRARY android REQUIRED)
    find_library(LOG_LIBRARY log REQUIRED)
    find_library(VULKAN_LIBRARY vulkan REQUIRED)
    list(APPEND BIONIC_FG_SOURCES src/jni_bridge.cpp)
elseif(UNIX AND NOT APPLE)
    find_package(Threads REQUIRED)
    find_package(Vulkan REQUIRED)
else()
    message(FATAL_ERROR "bionic-fg supports Android and glibc/Linux builds only")
endif()

add_library(bionic_fg SHARED
    ${BIONIC_FG_SOURCES}
)

target_include_directories(bionic_fg
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_options(bionic_fg PRIVATE
    -fvisibility=hidden
    -ffunction-sections
    -fdata-sections
)

if(ANDROID)
    target_link_libraries(bionic_fg
        ${ANDROID_LIBRARY}
        ${LOG_LIBRARY}
        ${VULKAN_LIBRARY}
    )
else()
    target_compile_definitions(bionic_fg PRIVATE BFG_GLIBC=1)
    target_link_libraries(bionic_fg PRIVATE Vulkan::Vulkan Threads::Threads dl)
endif()

target_link_options(bionic_fg PRIVATE
    -Wl,--gc-sections
)
