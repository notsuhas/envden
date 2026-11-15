#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux && "${PARITY_HOST_SHIMS:-}" == 1 ]] || { echo 'Disposable Linux GitHub runner required' >&2; exit 1; }
bun parity/harness/host/install.ts "$RUNNER_TEMP/host-shims"
for shim in "$RUNNER_TEMP/host-shims/"*; do
  sudo install -m 0755 "$shim" "/usr/bin/$(basename "$shim")"
done
