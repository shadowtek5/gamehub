cmake_minimum_required(VERSION 3.24)
project(vita-pfsdec C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Link OpenSSL, zlib and the C++ runtime statically so the binary only needs glibc: it ships in the
# self-update bundle and must run in older GameHub images that don't have libssl3/zlib installed.
set(OPENSSL_USE_STATIC_LIBS TRUE)
set(ZLIB_USE_STATIC_LIBS ON)

# Vita3K's maintained fork of psvpfsparser (offline F00D key derivation, OpenSSL 3), pinned.
include(FetchContent)
FetchContent_Declare(psvpfstools
    GIT_REPOSITORY https://github.com/Vita3K/psvpfstools.git
    GIT_TAG e9c5c7c
    GIT_SUBMODULES_RECURSE TRUE)
set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(psvpfstools)

add_executable(vita-pfsdec main.cpp)
target_link_libraries(vita-pfsdec PRIVATE psvpfsparser)
target_link_options(vita-pfsdec PRIVATE -static-libstdc++ -static-libgcc)
