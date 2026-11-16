#!/usr/bin/env bash
# Installs a stand-in tailscale (and, with PARITY_HOST_SHIMS=1, logging host-tool shims) at trusted paths.
# It replaces system binaries, so it only runs on a disposable CI runner.
set -euo pipefail

if [[ "${CI:-}" != true ]]; then
  echo "install-stand-ins.sh only runs on a disposable CI runner (CI=true)" >&2
  exit 1
fi

bin=/usr/local/bin
[[ "$(uname -s)" == Linux ]] && bin=/usr/bin

shims="${PARITY_HOST_SHIMS:-0}"
if [[ "$shims" == 1 && "$(uname -s)" != Linux ]]; then
  echo "PARITY_HOST_SHIMS=1 needs a Linux runner" >&2
  exit 1
fi

as_root() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }

work=$(mktemp -d)
log=':'
[[ "$shims" == 1 ]] && log='printf "%s\n" "$(basename "$0")" "$@" >> "$HOME/host-tools.log"'

cat > "$work/tailscale" <<SCRIPT
#!/bin/sh
# envden-parity-stand-in
$log
case "\$1 \$2" in
  "status --json") echo '{"BackendState":"Running","Self":{"DNSName":"parity.test.ts.net."},"CertDomains":["parity.test.ts.net"]}' ;;
  "serve status") echo '{}' ;;
  "serve --bg") exit 0 ;;
  *) exit 1 ;;
esac
SCRIPT

as_root install -m 0755 "$work/tailscale" "$bin/tailscale"

if [[ "$shims" == 1 ]]; then
  for tool in launchctl systemctl loginctl schtasks powershell.exe open xdg-open; do
    printf '#!/bin/sh\n# envden-parity-stand-in\n%s\n' "$log" > "$work/$tool"
    as_root install -m 0755 "$work/$tool" "$bin/$tool"
  done
fi

rm -rf "$work"
echo "installed parity stand-ins in $bin"
