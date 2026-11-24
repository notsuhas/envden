import { expect, test } from "bun:test";
import { redactSecrets } from "../redact.ts";

const SETUP =
  "043GE1R70W3GE1R70W3GE1R70W3GE1R70W4GJ289144GJ289144GJ289144GJ289144GJ289144GJ289144GJ";

const REPAIR =
  "081G60R30C1G60R30C1G60R30C1G60R30C2GA1850M2GA1850M2GA1850M2GA1850M2GA1850M2GA1850M2GA";

const CODE = "ER1-0R30C-1G60R-30C1G-60R30-C1G60-RWSY";

test.each([
  [`Setup token:\n  ${SETUP}`, "Setup token:\n  [setup token]"],
  [`repair ${REPAIR.toLowerCase()} done`, "repair [repair token] done"],
  [`code ${CODE} saved`, "code ER1-[redacted] saved"],
  [`typed ${CODE.replaceAll("-", "").toLowerCase()} end`, "typed ER1-[redacted] end"],
  [`spaced ${CODE.replaceAll("-", " ")} end`, "spaced ER1-[redacted] end"],
  ["blob 7ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ end", "blob [redacted] end"],
  ["DATABASE_URL=postgres://u:p@h/db", "DATABASE_URL=[redacted]"],
  ['export API_KEY="a b c"', "export API_KEY=[redacted]"],
  ["  secret = two words", "  secret =[redacted]"],
  [
    "request failed token=abc&code=1 at /x",
    "request failed token=[redacted]&code=[redacted] at /x",
  ],
  [
    "Unreadable config\n    at readConfig (config.ts:47:11)",
    "Unreadable config\n    at readConfig (config.ts:47:11)",
  ],
])("%p", (input, expected) => {
  expect(redactSecrets(input)).toBe(expected);
});
