#!/bin/sh
set -eu
: "${ENVDEN_PORT:=4280}"
case "$ENVDEN_PORT" in ''|*[!0-9]*) echo 'Invalid ENVDEN_PORT' >&2; exit 1 ;; esac
mkdir -p /data /var/lib/tailscale /var/run/tailscale
auth_key=${TS_AUTHKEY:-}
unset TS_AUTHKEY
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
attempt=0
while :; do
  status=$(timeout 5 tailscale status --json) || status=
  state=$(printf '%s' "$status" | sed -n 's/.*"BackendState"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  case "$state" in ''|NoState) ;; *) break ;; esac
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { echo 'Tailscale backend timeout' >&2; exit 1; }
  sleep 1
done
if [ "$state" = NeedsLogin ]; then
  [ -n "$auth_key" ] || { echo 'Set TS_AUTHKEY to a Tailscale auth key for first login' >&2; exit 1; }
  auth_file=$(mktemp /tmp/envden-auth.XXXXXX)
  chmod 600 "$auth_file"
  printf '%s' "$auth_key" > "$auth_file"
  timeout 30 tailscale up --hostname="${TS_HOSTNAME:-envden}" --accept-dns=false --auth-key="file:$auth_file"
  rm -f "$auth_file"
else
  timeout 5 tailscale set --hostname="${TS_HOSTNAME:-envden}" --accept-dns=false || echo 'Tailscale preferences unavailable; starting server' >&2
fi
unset auth_key
if [ "$state" = Stopped ]; then
  timeout 30 tailscale up --hostname="${TS_HOSTNAME:-envden}" --accept-dns=false || echo 'Tailscale resume unavailable; starting server' >&2
fi
timeout 5 tailscale serve --bg --https=443 "http://127.0.0.1:$ENVDEN_PORT" || echo 'Tailscale Serve unavailable; starting server' >&2
envden serve --data-dir /data --port "$ENVDEN_PORT" "$@" &
server=$!
while kill -0 "$daemon" 2>/dev/null && kill -0 "$server" 2>/dev/null; do
  sleep 1
done
cleanup
trap - EXIT
exit 1
