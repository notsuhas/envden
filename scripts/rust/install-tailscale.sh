#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Disposable GitHub runner required' >&2; exit 1; }
cat > "$RUNNER_TEMP/tailscale" <<'SHIM'
#!/bin/sh
if [ "$1" = status ]; then
  echo '{"BackendState":"Running","Self":{"DNSName":"parity.test.ts.net."},"CertDomains":["parity.test.ts.net"]}'
else
  exit 1
fi
SHIM
bin=/usr/local/bin
[[ "$RUNNER_OS" != Linux ]] || bin=/usr/bin
sudo install -m 0755 "$RUNNER_TEMP/tailscale" "$bin/tailscale"
