import type { TAdapters } from "../../../adapters.ts";
import { createDashboardApp, type TDashboardApp } from "../app.ts";

const port = 4100;
const token = "test-token";
const origin = `http://127.0.0.1:${port}`;

// Every response body is kept so a test can assert no env value ever left the dashboard.
export function dashboardClient(now: () => number) {
  const bodies: string[] = [];

  const assets = new Map([
    ["/", { body: new TextEncoder().encode("<p>page</p>").buffer, type: "text/html" }],
  ]);

  const app = (adapters: TAdapters) => createDashboardApp({ adapters, now, token, port, assets });

  async function send(
    dashboard: TDashboardApp,
    path: string,
    headers: Record<string, string> = {},
    body?: unknown,
  ) {
    const response = await dashboard.request(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Host: `127.0.0.1:${port}`,
        Authorization: `Bearer ${token}`,
        Origin: origin,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();
    bodies.push(text);

    return { response, text, json: () => JSON.parse(text) };
  }

  return { app, send, bodies };
}
