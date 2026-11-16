import type { TContext } from "../../runtime/context.ts";

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
