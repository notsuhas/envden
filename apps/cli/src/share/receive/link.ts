import { EnvdenError } from "@envden/core/errors";
import { readShareText, type IShareSecrets } from "@envden/core/protocol";

const PATH = /^\/s\/([A-Za-z0-9_-]{22})$/;

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

interface IShareLink {
  claim: string;
  share: IShareSecrets;
}

// Plain http only reaches this machine's own listener, as in a local test.
export function parseShareLink(text: string): IShareLink {
  const url = URL.parse(text.trim());
  const id = url && PATH.exec(url.pathname)?.[1];

  const secure =
    url?.protocol === "https:" || (url?.protocol === "http:" && LOOPBACK.has(url.hostname));

  if (!url || !id || !secure || url.search || url.username || url.password)
    throw new EnvdenError("INVALID_INPUT", "That isn't a complete envden share link");

  try {
    return {
      claim: `${url.origin}${url.pathname}/claim`,
      share: { id: readShareText(id, 16), key: readShareText(url.hash.slice(1), 32) },
    };
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "That isn't a complete envden share link", { cause });
  }
}
