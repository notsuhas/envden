import { expect, test } from "bun:test";
import { redactSecrets } from "../redact.ts";

const SETUP =
  "043GE1R70W3GE1R70W3GE1R70W3GE1R70W4GJ289144GJ289144GJ289144GJ289144GJ289144GJ289144GJ";

const REPAIR =
  "081G60R30C1G60R30C1G60R30C1G60R30C2GA1850M2GA1850M2GA1850M2GA1850M2GA1850M2GA1850M2GA";

const SECRET_KEY = "EK1-040G2-08104-0G208-1040G-20810-7PG2";

test.each([
  [`Setup token:\n  ${SETUP}`, "Setup token:\n  [setup token]"],
  [`repair ${REPAIR.toLowerCase()} done`, "repair [repair token] done"],
  [`kit ${SECRET_KEY} saved`, "kit EK1-[redacted] saved"],
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
