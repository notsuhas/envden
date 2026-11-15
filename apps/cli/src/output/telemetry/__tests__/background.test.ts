import { expect, test } from "bun:test";
import { childEnvironment, selfCommand } from "../background.ts";

test("the background sender re-runs envden itself, compiled or from source", () => {
  expect(
    selfCommand(["/usr/local/bin/envden", "/$bunfs/root/envden"], "/usr/local/bin/envden"),
  ).toEqual(["/usr/local/bin/envden", "telemetry-send"]);

  expect(selfCommand(["C:\\envden.exe", "B:\\~BUN\\root\\envden.exe"], "C:\\envden.exe")).toEqual([
    "C:\\envden.exe",
    "telemetry-send",
  ]);

  expect(selfCommand(["/bin/bun", "/repo/apps/cli/src/main.ts"], "/bin/bun")).toEqual([
    "/bin/bun",
    "/repo/apps/cli/src/main.ts",
    "telemetry-send",
  ]);
});

test("the background sender keeps proxy and CA settings so events pass a corporate proxy", () => {
  expect(
    childEnvironment("{}", {
      HTTPS_PROXY: "http://proxy:3128",
      http_proxy: "http://proxy:3128",
      NO_PROXY: "localhost",
      SSL_CERT_FILE: "/etc/ca.pem",
      NODE_EXTRA_CA_CERTS: "/etc/extra.pem",
      ENVDEN_HOME: "/data",
      NODE_OPTIONS: "--require evil.js",
    }),
  ).toEqual({
    ENVDEN_TELEMETRY_BODY: "{}",
    ENVDEN_NO_UPDATE_CHECK: "1",
    ENVDEN_HOME: "/data",
    HTTPS_PROXY: "http://proxy:3128",
    http_proxy: "http://proxy:3128",
    NO_PROXY: "localhost",
    SSL_CERT_FILE: "/etc/ca.pem",
    NODE_EXTRA_CA_CERTS: "/etc/extra.pem",
  });
});
