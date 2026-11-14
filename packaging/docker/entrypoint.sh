#!/bin/sh
set -eu
: "${ENVDEN_PORT:=4280}"
case "$ENVDEN_PORT" in ''|*[!0-9]*) echo 'Invalid ENVDEN_PORT' >&2; exit 1 ;; esac
mkdir -p /data /var/lib/tailscale /var/run/tailscale
tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state &
daemon=$!
server=
auth_file=
cleanup() {
  if [ -n "$auth_file" ]; then rm -f "$auth_file"; fi
  if [ -n "$server" ]; then kill "$server" 2>/dev/null || true; wait "$server" || true; fi
  kill "$daemon" 2>/dev/null || true
  wait "$daemon" || true
}
trap 'cleanup' EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
attempt=0
while [ ! -S /var/run/tailscale/tailscaled.sock ]; do
  kill -0 "$daemon"
  attempt=$((attempt + 1))
  [ "$attempt" -le 30 ] || { echo 'Tailscale socket timeout' >&2; exit 1; }
  sleep 1
done
if tailscale status --json | grep -Eq '"BackendState"[[:space:]]*:[[:space:]]*"NeedsLogin"'; then
  : "${TS_AUTHKEY:?Set TS_AUTHKEY to a Tailscale auth key for first login}"
  auth_file=$(mktemp /tmp/envden-auth.XXXXXX)
  chmod 600 "$auth_file"
  printf '%s' "$TS_AUTHKEY" > "$auth_file"
  unset TS_AUTHKEY
  tailscale up --hostname="${TS_HOSTNAME:-envden}" --accept-dns=false --auth-key="file:$auth_file"
  rm -f "$auth_file"
else
  tailscale up --hostname="${TS_HOSTNAME:-envden}" --accept-dns=false
fi
unset TS_AUTHKEY
tailscale serve --bg --https=443 "http://127.0.0.1:$ENVDEN_PORT"
envden serve --data-dir /data --port "$ENVDEN_PORT" "$@" &
server=$!
while kill -0 "$daemon" 2>/dev/null && kill -0 "$server" 2>/dev/null; do
  sleep 1
done
cleanup
trap - EXIT
exit 1
