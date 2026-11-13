import { HTTPException } from "hono/http-exception";

const capacity = 134217728;

let reserved = 0;

export function reserveBody(bytes: number): () => void {
  if (reserved + bytes > capacity)
    throw new HTTPException(503, { message: "Body budget exceeded" });

  reserved += bytes;

  return () => {
    reserved -= bytes;
  };
}
