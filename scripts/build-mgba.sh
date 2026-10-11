#!/usr/bin/env bash
# Build mGBA 0.10.5 natively and install its Python binding into env/.venv.
#
# Why from source: PyPI `mgba==0.10.2` has no macOS arm64 wheel and links a
# system libmgba; Homebrew's mgba formula ships no Python binding.
# Why FFmpeg on: with USE_FFMPEG=OFF the cffi binding references EReader
# symbols that are compiled out, and `import mgba.core` fails.
#
# Requires: cmake, ffmpeg, libpng (Homebrew); env/.venv from `uv sync`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MGBA_TAG="0.10.5"
MGBA_COMMIT="26b7884bc25a5933960f3cdcd98bac1ae14d42e2"
CACHE="$ROOT/.cache/mgba"
SRC="$CACHE/src"
BUILD="$CACHE/build"
VENV_PY="$ROOT/env/.venv/bin/python"

[[ -x "$VENV_PY" ]] || { echo "env/.venv missing: run 'just setup' first" >&2; exit 1; }
for tool in cmake git install_name_tool codesign; do
    command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

if [[ ! -d "$SRC/.git" ]]; then
    git clone --quiet --depth 1 --branch "$MGBA_TAG" https://github.com/mgba-emu/mgba.git "$SRC"
fi
actual="$(git -C "$SRC" rev-parse HEAD)"
[[ "$actual" == "$MGBA_COMMIT" ]] || { echo "mGBA source is $actual, expected $MGBA_COMMIT" >&2; exit 1; }

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

shopt -s nullglob
pkgs=("$BUILD"/python/lib.*/mgba)
shopt -u nullglob
(( ${#pkgs[@]} == 1 )) || { echo "expected one built mgba package, found ${#pkgs[@]}" >&2; exit 1; }

SITE="$("$VENV_PY" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
DEST="$SITE/mgba"
rm -rf "$DEST"
cp -R "${pkgs[0]}" "$DEST"
rm -rf "$DEST/__pycache__"
cp "$BUILD/libmgba.$MGBA_TAG.dylib" "$DEST/libmgba.0.10.dylib"
install_name_tool -id @rpath/libmgba.0.10.dylib "$DEST/libmgba.0.10.dylib"
install_name_tool -delete_rpath "$BUILD" -add_rpath @loader_path "$DEST/_pylib.abi3.so"
codesign --force --sign - "$DEST/libmgba.0.10.dylib" "$DEST/_pylib.abi3.so"

(cd / && "$VENV_PY" -I -c 'import mgba.core, mgba.image; print("mgba binding OK")')
