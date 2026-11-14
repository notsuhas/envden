#!/bin/ash
set -eu
: "${TS_AUTHKEY:?Set TS_AUTHKEY to a Tailscale auth key}"
: "${ENVDEN_PORT:=4280}"
case "$ENVDEN_PORT" in ''|*[!0-9]*) echo 'Invalid ENVDEN_PORT' >&2; exit 1 ;; esac
mkdir -p /data /var/lib/tailscale /var/run/tailscale
tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state &
daemon=$!
server=
cleanup() {
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
tailscale up --auth-key="$TS_AUTHKEY" --hostname="${TS_HOSTNAME:-envden}" --accept-dns=false
unset TS_AUTHKEY
tailscale serve --bg --https=443 "http://127.0.0.1:$ENVDEN_PORT"
envden serve --data-dir /data --port "$ENVDEN_PORT" "$@" &
server=$!
wait -n
exit 1
