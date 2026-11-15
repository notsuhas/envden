import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every test temp folder lands under one run folder, removed when the run ends.
const root = mkdtempSync(join(tmpdir(), "envden-test-run-"));

process.env.TMPDIR = root;

afterAll(() => rmSync(root, { recursive: true, force: true }));
