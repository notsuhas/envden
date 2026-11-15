#!/bin/sh
# Cross-compiles envden for the eight platforms the TypeScript release ships, with the same asset names.
set -eu

cd "$(dirname "$0")/.."
mkdir -p dist

targets="${*:-darwin-x64 darwin-arm64 linux-x64 linux-arm64 linux-x64-musl linux-arm64-musl windows-x64 windows-arm64}"

for target in $targets; do
  os="${target%%-*}"
  rest="${target#*-}"
  arch="${rest%%-*}"

  case "$arch" in
    x64) goarch=amd64 ;;
    arm64) goarch=arm64 ;;
    *) echo "Unsupported target: $target" >&2; exit 1 ;;
  esac

  case "$os" in
    darwin | linux | windows) ;;
    *) echo "Unsupported target: $target" >&2; exit 1 ;;
  esac

  asset="envden-$target"
  [ "$os" = windows ] && asset="$asset.exe"

  # CGO off gives static binaries, so the musl targets need no separate libc build
  CGO_ENABLED=0 GOOS="$os" GOARCH="$goarch" go build -trimpath \
    -ldflags "-s -w -X github.com/notsuhas/envden/go/cli/version.TelemetryKey=${ENVDEN_TELEMETRY_KEY:-}" \
    -o "dist/$asset" ./cmd/envden

  echo "built dist/$asset"
done
