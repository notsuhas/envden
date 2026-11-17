#!/usr/bin/env bash
# Compares this checkout's TypeScript CLI with the Go and Rust ports inside throwaway Linux containers.
# Usage: bash parity/local/run.sh   (PARITY_GO_REF, PARITY_RUST_REF and PARITY_SHARDS override the defaults)
set -euo pipefail

root=$(git rev-parse --show-toplevel)
go_ref=${PARITY_GO_REF:-port/go}
rust_ref=${PARITY_RUST_REF:-port/rust}
shards=${PARITY_SHARDS:-4}
work=${PARITY_WORK:-${TMPDIR:-/tmp}/envden-parity}
logs="$work/logs/$(date +%Y%m%d-%H%M%S)"
image=envden-parity
names=()

cleanup() { [[ ${#names[@]} -eq 0 ]] || docker rm -f "${names[@]}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "TypeScript: working tree at $root"
echo "Go: $go_ref ($(git -C "$root" rev-parse --short "$go_ref"))"
echo "Rust: $rust_ref ($(git -C "$root" rev-parse --short "$rust_ref"))"

rm -rf "${work:?}/ts" "${work:?}/go" "${work:?}/rust" "${work:?}/bin"
mkdir -p "$work/ts" "$work/go" "$work/rust" "$work/bin" "$logs"
git -C "$root" ls-files -co --exclude-standard -z | (cd "$root" && tar --null -T - -cf -) | tar -x -C "$work/ts"
git -C "$root" archive "$go_ref" | tar -x -C "$work/go"
git -C "$root" archive "$rust_ref" | tar -x -C "$work/rust"

bun_version=$(sed -n 's/.*"packageManager": "bun@\([^"]*\)".*/\1/p' "$root/package.json")
go_version=$(sed -n 's/^go \(.*\)$/\1/p' "$work/go/go/go.mod")
rust_version=$(sed -n 's/^channel = "\(.*\)"$/\1/p' "$work/rust/rust-toolchain.toml")

docker build -q -t "$image" \
  --build-arg "BUN_VERSION=$bun_version" --build-arg "GO_VERSION=$go_version" --build-arg "RUST_VERSION=$rust_version" \
  "$root/parity/local" >/dev/null

box() {
  local name=$1
  shift
  docker run --rm --init --name "$name" -v "$work:/work" -w /work/ts \
    -v envden-parity-bun:/root/.bun/install/cache -v envden-parity-go:/root/go \
    -v envden-parity-cargo:/root/.cargo/registry -v envden-parity-target:/work/target \
    "$image" bash -ec "$*"
}

echo "building all three (log: $logs/build.log)"
name="envden-parity-$$-build"
names+=("$name")
box "$name" '
  bun install --frozen-lockfile && (cd apps/cli && bun run build) && cp apps/cli/dist/envden /work/bin/ts
  (cd /work/go/go && go build -o /work/bin/go ./cmd/envden)
  (cd /work/rust && CARGO_TARGET_DIR=/work/target cargo build --release -p envden-cli && cp /work/target/release/envden /work/bin/rust)
' >"$logs/build.log" 2>&1 || { tail -30 "$logs/build.log"; exit 1; }

# shellcheck disable=SC2016 # these expand inside the container
compare='bash parity/ci/install-stand-ins.sh >/dev/null
  bun parity/run.ts --reference /work/bin/ts --candidate /work/bin/go --mix --third /work/bin/rust --shard SHARD
  bun parity/run.ts --reference /work/bin/ts --candidate /work/bin/rust --mix --shard SHARD'

# shellcheck disable=SC2016 # these expand inside the container
extras='bash parity/ci/install-stand-ins.sh >/dev/null
  for impl in go rust; do
    bun parity/transport.ts --reference /work/bin/ts --candidate /work/bin/$impl --mode semantic
    bun apps/cli/scripts/e2e.ts /work/bin/$impl
  done
  bun parity/verify.ts /work/bin/ts
  PARITY_HOST_SHIMS=1 bash parity/ci/install-stand-ins.sh >/dev/null
  for impl in go rust; do
    PARITY_HOST_SHIMS=1 bun parity/run.ts --reference /work/bin/ts --candidate /work/bin/$impl --scenario host-here
  done'

echo "comparing in $shards shards plus transport, e2e and host checks (logs: $logs)"
pids=()
for i in $(seq 1 "$shards"); do
  name="envden-parity-$$-shard-$i"
  names+=("$name")
  box "$name" "${compare//SHARD/$i/$shards}" >"$logs/shard-$i.log" 2>&1 &
  pids+=($!)
done
name="envden-parity-$$-extras"
names+=("$name")
box "$name" "$extras" >"$logs/extras.log" 2>&1 &
pids+=($!)

failed=0
for pid in "${pids[@]}"; do wait "$pid" || failed=1; done

grep -h "comparisons passed" "$logs"/shard-*.log || true
grep -h "^FAIL" "$logs"/*.log || true

if [[ $failed -ne 0 ]]; then
  echo "parity FAILED; see $logs"
  exit 1
fi

echo "parity passed: TypeScript, Go and Rust match"
