import type { TContext } from "../../runtime/context.ts";
import { statusBody } from "../../normalize/status.ts";

export async function requestStatus(c: TContext, url: string) {
  const response = await fetch(url);

  if (response.status !== 200) throw new Error(`Status endpoint returned ${response.status}`);

  c.observe(
    "http server status",
    {
      stdout: JSON.stringify({ status: response.status, body: statusBody(await response.json()) }),
      stderr: "",
      code: 0,
    },
    "json",
  );
}

// Records only status and body length; transport.ts compares full HTTP framing.
export async function request(c: TContext, label: string, url: string, method = "GET") {
  const response = await fetch(url, { method });
  const body = await response.arrayBuffer();

  c.observe(`http ${label}`, {
    stdout: `${method} status ${response.status} body ${body.byteLength}\n`,
    stderr: "",
    code: 0,
  });

  return response.status;
}
