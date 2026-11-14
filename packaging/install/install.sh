#!/bin/sh
main() {
set -eu
usage() { echo 'Usage: install.sh [--platform] [--help]'; }
case "${1:-}" in --help) usage; exit 0 ;; ''|--platform) ;; *) usage >&2; exit 2 ;; esac
os=$(uname -s)
arch=$(uname -m)
case "$os" in Darwin) os=darwin ;; Linux) os=linux ;; *) echo 'Unsupported OS' >&2; exit 1 ;; esac
case "$arch" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) echo 'Unsupported architecture' >&2; exit 1 ;; esac
platform=$os-$arch
if [ "$os" = linux ] && { ldd --version 2>&1 || true; } | grep -qi musl; then platform=$platform-musl; fi
if [ "${1:-}" = --platform ]; then echo "$platform"; exit 0; fi
repo=notsuhas/envden
case "$repo" in *REPLACE*) echo 'Maintainer must configure the release repository' >&2; exit 1 ;; esac
version=${ENVDEN_VERSION:-latest}
if [ "$version" = latest ]; then
  base="https://github.com/$repo/releases/latest/download"
else
  case "$version" in *[!v0-9.]*) valid=false ;; *) valid=true ;; esac
  if [ "$valid" != true ] || ! printf '%s\n' "$version" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
    echo 'Invalid ENVDEN_VERSION: expected latest or vX.Y.Z (stable, no leading zeros)' >&2
    exit 2
  fi
  base="https://github.com/$repo/releases/download/$version"
fi
bin=${ENVDEN_INSTALL_DIR:-"$HOME/.local/bin"}
home=${ENVDEN_HOME:-"$HOME/.envden"}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM
asset=envden-$platform
progress=--silent
if [ -t 1 ]; then progress=--progress-bar; fi
curl --fail "$progress" --show-error --location --connect-timeout 15 --retry 3 --proto '=https' --proto-redir '=https' --tlsv1.2 "$base/$asset" -o "$work/$asset"
curl --fail --silent --show-error --location --connect-timeout 15 --retry 3 --proto '=https' --proto-redir '=https' --tlsv1.2 "$base/SHA256SUMS" -o "$work/SHA256SUMS"
expected=$(awk -v name="$asset" '$2 == name {print $1}' "$work/SHA256SUMS")
[ "${#expected}" = 64 ] || { echo 'Missing or duplicate checksum' >&2; exit 1; }
case "$expected" in *[!0-9a-f]*) exit 1 ;; esac
if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$work/$asset"); else actual=$(shasum -a 256 "$work/$asset"); fi
[ "${actual%% *}" = "$expected" ] || { echo 'Checksum mismatch' >&2; exit 1; }
mkdir -p "$bin" "$home"
staged=$(mktemp "$bin/.envden-install.XXXXXX")
cp "$work/$asset" "$staged"
chmod 755 "$staged"
mv -f "$staged" "$bin/envden"
printf 'script' > "$home/install-method"
echo "Installed $bin/envden. Add $bin to PATH."
echo 'Verified SHA256SUMS over HTTPS. Integrity rests on GitHub and TLS.'
}
main "$@"
