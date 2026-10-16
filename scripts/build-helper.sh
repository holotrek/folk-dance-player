#!/bin/sh
# Builds the Music library helper (Apple Music sync spec §3.1) as a Universal binary in
# resources/bin/, which electron-builder copies into the app. Needs Xcode's command line tools.
# macOS 12 is Electron 44's minimum, and ITLibPlaylist.isPrimary needs it.
set -eu
cd "$(dirname "$0")/.."
src=native/music-library/main.swift
work=out/helper
mkdir -p "$work" resources/bin
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos12.0" -framework iTunesLibrary -o "$work/$arch" "$src"
done
lipo -create -output resources/bin/fdp-music-library "$work/arm64" "$work/x86_64"
echo "Built resources/bin/fdp-music-library"
