export function createApi(token: string) {
  return async function call<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(json));

    return json as T;
  };
}

function errorMessage(json: unknown) {
  return json && typeof json === "object" && "message" in json && typeof json.message === "string"
    ? json.message
    : "Request failed";
}
