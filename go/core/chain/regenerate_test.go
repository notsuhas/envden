package chain

import (
	"os"
	"os/exec"
	"testing"
)

func TestRegenerateReference(t *testing.T) {
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}

	if err := os.WriteFile("testdata/capture.mjs", []byte(`// cd go && bun test --preload ./core/chain/testdata/capture.mjs ../packages/core/src/chain
import { plugin } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
const rows = [];
const seen = new Set;
function pack(v) {
  if (typeof v === "bigint")
    return Number(v);
  if (v instanceof Uint8Array)
    return Buffer.from(v).toString("base64");
  if (v instanceof Map) {
    const o = {};
    for (const [k, x] of v)
      o[k] = pack(x);
    return o;
  }
  if (v instanceof Set)
    return Object.fromEntries([...v].map((x) => [x, true]));
  if (v instanceof Error)
    return { error: v.message, code: v.code };
  if (Array.isArray(v))
    return v.map(pack);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) {
      if (typeof v[k] !== "function" && !["encSk", "objSk", "reqSk"].includes(k))
        o[k] = pack(v[k]);
    }
    if (v.devices instanceof Map)
      o.deviceOrder = [...v.devices.keys()];
    return o;
  }
  if (typeof v === "function")
    return;
  return v;
}
globalThis.__capture = (name, fn, args) => {
  let input;
  try {
    input = pack(args);
  } catch {
    return fn(...args);
  }
  const sourceCalls = [];
  let callargs = args;
  const wrapSource = (source) => Object.fromEntries(["header", "entry", "files", "keyring", "epochKey"].map((method) => [method, async (...a) => {
    try {
      const value = await source[method](...a);
      sourceCalls.push({ method, args: pack(a), value: pack(value) ?? null });
      return value;
    } catch (error) {
      sourceCalls.push({ method, args: pack(a), error: pack(error) });
      throw error;
    }
  }]));
  if (name === "acceptManifest")
    callargs = [{ ...args[0], source: wrapSource(args[0].source) }];
  if (name === "checkHeaderSignature")
    callargs = [wrapSource(args[0]), ...args.slice(1)];
  function save(value, error) {
    try {
      const row = { name, testName: globalThis.__chainTestName, args: input, calls: sourceCalls, ...error ? { error: pack(error) } : { result: pack(value) ?? null } };
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
        writeFileSync(new URL("./typescript.json", import.meta.url), JSON.stringify(rows));
      }
    } catch {}
  }
  try {
    const r = fn(...callargs);
    if (r instanceof Promise)
      return r.then((v) => {
        save(v);
        return v;
      }, (e) => {
        save(undefined, e);
        throw e;
      });
    save(r);
    return r;
  } catch (e) {
    save(undefined, e);
    throw e;
  }
};
plugin({ name: "chain-capture", setup(build) {
  build.onLoad({ filter: /packages\/core\/src\/chain\/.*\.ts$/ }, (args) => {
    let contents = readFileSync(args.path, "utf8");
    let suffix = "";
    if (args.path.endsWith(".test.ts")) {
      contents = contents.replace(/import \{([^}]*?)\btest\b([^}]*?)\} from \"bun:test\";/, (_m, a, b) => `+"`"+`import {${a}test as __baseTest${b}} from "bun:test";
const test=(name:any,fn:any)=>__baseTest(name,()=>{(globalThis as any).__chainTestName=name;return fn()});`+"`"+`);
    }
    const names = ["applyEntry", "verifyChain", "acceptManifest", "validateSwap", "classifyNonMember", "checkedFiles", "changedFiles", "checkHeaderSignature", "filterRepairReports", "missingReportMembers", "classifyMissingBlobs", "chooseRecoveryCandidate", "repairLoginDecision", "refuseSecretKeyProof", "isReusedRepairToken"];
    for (const name of names) {
      const re = new RegExp("export (async )?function " + name + "\\(");
      if (re.test(contents)) {
        contents = contents.replace(re, (_m, a) => "function " + (a ? "" : "") + "__original_" + name + "(");
        if (contents.includes("await ") && name.match(/acceptManifest|checkHeaderSignature/))
          contents = contents.replace("function __original_" + name, "async function __original_" + name);
        suffix += `+"`"+`
export function ${name}(...args:any[]):any{return (globalThis as any).__capture('${name}',__original_${name},args)}
`+"`"+`;
      }
    }
    return { contents: contents + suffix, loader: "ts" };
  });
} });
`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove("testdata/capture.mjs") })

	cmd0 := exec.Command("bun", "test", "--preload", "./testdata/capture.mjs", "../../../packages/core/src/chain")
	cmd0.Env = append(os.Environ(), "TZ=UTC")
	if output, err := cmd0.CombinedOutput(); err != nil {
		t.Fatalf("reference: %v\n%s", err, output)
	}
}
