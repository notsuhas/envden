import { test, expect } from "bun:test";
import { validatePulledPath } from "../index.ts";

for (const path of [
  ".g\u200cit/config",
  "nested/\u200d.env",
  ".git/config",
  ".GIT/x",
  "GIT~1/.env",
  "nested/ENV~2",
  ".env~1",
])
  test(`reject ${JSON.stringify(path)}`, () => expect(() => validatePulledPath(path)).toThrow());
