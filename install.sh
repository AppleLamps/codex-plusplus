#!/usr/bin/env bash
set -euo pipefail

REPO="${CODEX_PLUSPLUS_REPO:-b-nnett/codex-plusplus}"
REF="${CODEX_PLUSPLUS_REF:-main}"
INSTALL_DIR="${CODEX_PLUSPLUS_SOURCE_DIR:-$HOME/.codex-plusplus/source}"

if ! command -v node >/dev/null 2>&1; then
  echo "codex-plusplus install failed: Node.js 20+ is required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "codex-plusplus install failed: Node.js 20+ is required; found $(node -v)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "codex-plusplus install failed: npm is required to build from GitHub source." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "codex-plusplus install failed: curl is required." >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "codex-plusplus install failed: tar is required." >&2
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/codex-plusplus.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

ARCHIVE="$WORK/source.tar.gz"
EXTRACT="$WORK/extract"
NEXT="$WORK/source"

echo "Downloading codex-plusplus from https://github.com/$REPO ($REF)..."
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" -o "$ARCHIVE"
mkdir -p "$EXTRACT"
tar -xzf "$ARCHIVE" -C "$EXTRACT" --strip-components 1
mv "$EXTRACT" "$NEXT"

echo "Installing dependencies..."
if [ -f "$NEXT/package-lock.json" ]; then
  npm ci --prefix "$NEXT"
else
  npm install --prefix "$NEXT"
fi

echo "Building codex-plusplus..."
npm run build --prefix "$NEXT"

mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR.previous"
if [ -d "$INSTALL_DIR" ]; then
  mv "$INSTALL_DIR" "$INSTALL_DIR.previous"
fi
mv "$NEXT" "$INSTALL_DIR"

echo "Running installer..."
node "$INSTALL_DIR/packages/installer/dist/cli.js" install "$@"

echo
echo "codex-plusplus source installed at: $INSTALL_DIR"
