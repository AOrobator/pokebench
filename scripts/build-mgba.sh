#!/usr/bin/env bash
# Build mGBA 0.10.5 natively and install its Python binding into env/.venv.
#
# Why from source: PyPI `mgba==0.10.2` has no macOS arm64 wheel and links a
# system libmgba; Homebrew's mgba formula ships no Python binding.
# Why FFmpeg on: with USE_FFMPEG=OFF the cffi binding references EReader
# symbols that are compiled out, and `import mgba.core` fails.
#
# macOS requires: cmake, ffmpeg, libpng (Homebrew); env/.venv from `uv sync`.
# Linux requires: cmake, a C toolchain, pkg-config and the FFmpeg/libpng/zlib
# development packages (apt line below); env/.venv from `uv sync`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MGBA_TAG="0.10.5"
MGBA_COMMIT="26b7884bc25a5933960f3cdcd98bac1ae14d42e2"
CACHE="$ROOT/.cache/mgba"
SRC="$CACHE/src"
BUILD="$CACHE/build"
VENV_PY="$ROOT/env/.venv/bin/python"
APT_LINE="sudo apt-get update && sudo apt-get install -y cmake build-essential pkg-config libavcodec-dev libavformat-dev libavfilter-dev libavutil-dev libswscale-dev libswresample-dev libpng-dev zlib1g-dev"

require_tools() {
    for tool in "$@"; do
        command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
    done
}

fetch_source() {
    if [[ ! -d "$SRC/.git" ]]; then
        git clone --quiet --depth 1 --branch "$MGBA_TAG" https://github.com/mgba-emu/mgba.git "$SRC"
    fi
    actual="$(git -C "$SRC" rev-parse HEAD)"
    [[ "$actual" == "$MGBA_COMMIT" ]] || { echo "mGBA source is $actual, expected $MGBA_COMMIT" >&2; exit 1; }
}

built_package() {
    shopt -s nullglob
    pkgs=("$BUILD"/python/lib.*/mgba)
    shopt -u nullglob
    (( ${#pkgs[@]} == 1 )) || { echo "expected one built mgba package, found ${#pkgs[@]}" >&2; exit 1; }
    printf '%s\n' "${pkgs[0]}"
}

import_check() {
    (cd / && "$VENV_PY" -I -c 'import mgba.core, mgba.image; print("mgba binding OK")')
}

build_darwin() {
    require_tools cmake git install_name_tool codesign
    fetch_source

    PKGCONF="$("$VENV_PY" -c 'import shutil,sys,os; print(os.path.join(os.path.dirname(sys.executable),"pkgconf"))')"
    [[ -x "$PKGCONF" ]] || { echo "pkgconf missing from env/.venv (uv sync --group mgba-build)" >&2; exit 1; }
    BREW_PREFIX="$(brew --prefix)"

    PKG_CONFIG_PATH="$BREW_PREFIX/lib/pkgconfig" PATH="$(dirname "$VENV_PY"):$PATH" cmake -S "$SRC" -B "$BUILD" \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
        -DBUILD_PYTHON=ON -DBUILD_QT=OFF -DBUILD_SDL=OFF -DBUILD_GL=OFF \
        -DUSE_FFMPEG=ON -DUSE_LUA=OFF -DUSE_DISCORD_RPC=OFF -DUSE_EPOXY=OFF \
        -DPython_EXECUTABLE="$VENV_PY" -DPYTHON_EXECUTABLE="$VENV_PY" \
        -DPKG_CONFIG_EXECUTABLE="$PKGCONF" >"$CACHE/cmake.log"
    PATH="$(dirname "$VENV_PY"):$PATH" cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu)" >"$CACHE/build.log"

    pkg="$(built_package)"
    SITE="$("$VENV_PY" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
    DEST="$SITE/mgba"
    rm -rf "$DEST"
    cp -R "$pkg" "$DEST"
    rm -rf "$DEST/__pycache__"
    cp "$BUILD/libmgba.$MGBA_TAG.dylib" "$DEST/libmgba.0.10.dylib"
    install_name_tool -id @rpath/libmgba.0.10.dylib "$DEST/libmgba.0.10.dylib"
    install_name_tool -delete_rpath "$BUILD" -add_rpath @loader_path "$DEST/_pylib.abi3.so"
    codesign --force --sign - "$DEST/libmgba.0.10.dylib" "$DEST/_pylib.abi3.so"

    import_check
}

# The first pkg-config on PATH outside env/.venv: an activated venv puts the PyPI pkgconf's
# pkg-config first, and that one misses the distribution's pkgconfig directories.
system_pkg_config() {
    local venv_bin dir
    venv_bin="$(cd "$(dirname "$VENV_PY")" && pwd -P)"
    local IFS=:
    for dir in $PATH; do
        [[ -n "$dir" && -x "$dir/pkg-config" ]] || continue
        [[ "$(cd "$dir" && pwd -P)" == "$venv_bin" ]] && continue
        printf '%s\n' "$dir/pkg-config"
        return
    done
    echo "missing required tool: pkg-config outside env/.venv" >&2
    exit 1
}

# Tested on Ubuntu 24.04 x86_64 (2026-11-11). The venv's PyPI pkgconf does not
# search Debian's multiarch pkgconfig directory, so cmake gets the system
# pkg-config; otherwise it silently builds without FFmpeg.
build_linux() {
    require_tools cmake git cc readelf nproc
    SYSTEM_PKGCONF="$(system_pkg_config)"
    local missing=() module
    for module in libavcodec libavformat libavfilter libavutil libswscale libswresample libpng zlib; do
        "$SYSTEM_PKGCONF" --exists "$module" || missing+=("$module")
    done
    if (( ${#missing[@]} > 0 )); then
        echo "missing development libraries: ${missing[*]}" >&2
        echo "Debian/Ubuntu: $APT_LINE" >&2
        exit 1
    fi
    fetch_source

    PYINC="$("$VENV_PY" -c 'import sysconfig; print(sysconfig.get_paths()["include"])')"
    rm -rf "$BUILD"
    PATH="$(dirname "$VENV_PY"):$PATH" cmake -S "$SRC" -B "$BUILD" \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
        -DBUILD_PYTHON=ON -DBUILD_QT=OFF -DBUILD_SDL=OFF -DBUILD_GL=OFF \
        -DUSE_FFMPEG=ON -DUSE_LUA=OFF -DUSE_DISCORD_RPC=OFF -DUSE_EPOXY=OFF \
        -DPython_EXECUTABLE="$VENV_PY" -DPYTHON_EXECUTABLE="$VENV_PY" \
        -DPython_INCLUDE_DIR="$PYINC" -DPYTHON_INCLUDE_DIR="$PYINC" \
        -DPKG_CONFIG_EXECUTABLE="$SYSTEM_PKGCONF" \
        -DCMAKE_SHARED_LINKER_FLAGS="-Wl,-rpath,\$ORIGIN" >"$CACHE/cmake.log"
    grep -q "GIF/Video recording: ON" "$CACHE/cmake.log" || {
        echo "cmake did not enable FFmpeg (see $CACHE/cmake.log); Debian/Ubuntu: $APT_LINE" >&2
        exit 1
    }
    PATH="$(dirname "$VENV_PY"):$PATH" CFLAGS="-I$PYINC" LDFLAGS="-Wl,-rpath,\$ORIGIN" \
        cmake --build "$BUILD" -j "$(nproc)" >"$CACHE/build.log"

    pkg="$(built_package)"
    SITE="$("$VENV_PY" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
    DEST="$SITE/mgba"
    rm -rf "$DEST"
    cp -R "$pkg" "$DEST"
    rm -rf "$DEST/__pycache__"
    cp "$BUILD/libmgba.so.$MGBA_TAG" "$DEST/libmgba.so.0.10"
    dynamic="$(readelf -d "$DEST/_pylib.abi3.so")"
    # shellcheck disable=SC2016 # a literal $ORIGIN, not an expansion
    grep -q 'RUNPATH.*\$ORIGIN' <<<"$dynamic" || {
        echo "the binding's RUNPATH lacks \$ORIGIN, so it would load libmgba from the build directory" >&2
        exit 1
    }

    import_check
}

[[ -x "$VENV_PY" ]] || { echo "env/.venv missing: run 'just setup' first" >&2; exit 1; }
mkdir -p "$CACHE"
case "$(uname -s)" in
    Darwin) build_darwin ;;
    Linux) build_linux ;;
    *) echo "build-mgba: $(uname -s) is not supported (macOS arm64 and Linux x86_64 are)" >&2; exit 1 ;;
esac
