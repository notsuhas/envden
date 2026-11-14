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
case "$version" in latest) base="https://github.com/$repo/releases/latest/download" ;; v[0-9]*.[0-9]*.[0-9]*)
  case "$version" in *[!a-zA-Z0-9.+-]*) exit 2 ;; esac
  base="https://github.com/$repo/releases/download/$version" ;; *) echo 'Invalid ENVDEN_VERSION' >&2; exit 2 ;; esac
bin=${ENVDEN_INSTALL_DIR:-"$HOME/.local/bin"}
home=${ENVDEN_HOME:-"$HOME/.envden"}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM
asset=envden-$platform
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$base/$asset" -o "$work/$asset"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$base/SHA256SUMS" -o "$work/SHA256SUMS"
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
echo 'Bootstrap verified SHA256SUMS over HTTPS; it does not authenticate the signed feed.'
}
main "$@"
