export interface IComparable {
  status: string;
  headers: string[];
  body: string;
}

const IGNORED = /^(?:date|connection|keep-alive):/i;

function bodyless(method: string, status: string): boolean {
  return method === "HEAD" || /^HTTP\/\d\.\d (?:1\d\d|204|304) /.test(status);
}

// Returns the length of the first complete response in bytes, or undefined while incomplete.
export function responseLength(bytes: Buffer, method: string): number | undefined {
  const boundary = bytes.indexOf("\r\n\r\n");
  if (boundary < 0) return undefined;

  const head = bytes.subarray(0, boundary).toString("latin1");
  const status = head.split("\r\n")[0] ?? "";
  const length = Number(/^content-length:\s*(\d+)\s*$/im.exec(head)?.[1] ?? 0);
  const total = boundary + 4 + (bodyless(method, status) ? 0 : length);

  return bytes.length >= total ? total : undefined;
}

export function comparable(bytes: Buffer): IComparable {
  const boundary = bytes.indexOf("\r\n\r\n");
  if (boundary < 0) return { status: "<incomplete>", headers: [], body: bytes.toString("base64") };

  const lines = bytes.subarray(0, boundary).toString("latin1").split("\r\n");
  const body = bytes.subarray(boundary + 4).toString("latin1");

  return {
    status: lines[0] ?? "",
    headers: lines.slice(1).filter((line) => !IGNORED.test(line)),
    body: body.replace(/("uptimeSeconds":)\d+/, "$1<N>"),
  };
}

export function comparableMany(bytes: Buffer, methods: string[]): IComparable[] {
  const results: IComparable[] = [];
  let offset = 0;

  for (const method of methods) {
    const length = responseLength(bytes.subarray(offset), method);
    if (length === undefined) break;

    results.push(comparable(bytes.subarray(offset, offset + length)));
    offset += length;
  }

  if (offset < bytes.length) results.push(comparable(bytes.subarray(offset)));

  return results;
}
