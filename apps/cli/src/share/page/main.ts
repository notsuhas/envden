import { decryptShare, linkComplete } from "./decrypt.ts";

const status = element("status");
const openButton = element<HTMLButtonElement>("open");
const contents = element<HTMLTextAreaElement>("contents");
const key = location.hash.slice(1);
const id = location.pathname.split("/").pop() ?? "";

let bytes = new Uint8Array();

function element<T extends HTMLElement = HTMLElement>(name: string): T {
  return document.getElementById(name) as T;
}

function say(text: string, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

// Each failure is one fixed sentence; nothing from the file or key is shown.
const failures: Record<number, string> = {
  410: "This link was already opened. Each link works once; ask the sender for a new one.",
  404: "This link has expired or was closed. Ask the sender for a new one.",
};

async function claim(): Promise<Uint8Array | undefined> {
  const response = await fetch(`${location.pathname}/claim`, {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
  }).catch(() => undefined);

  if (response?.ok) return new Uint8Array(await response.arrayBuffer());

  const failure = response && failures[response.status];
  say(failure ?? "Couldn't reach the sender. The link may have expired or been closed.", true);
  openButton.disabled = false;
  openButton.hidden = Boolean(failure);

  return undefined;
}

async function open() {
  openButton.disabled = true;
  say("Opening…");

  const box = await claim();
  if (!box) return;

  history.replaceState(null, "", location.pathname);

  try {
    bytes = await decryptShare(key, id, box);
  } catch {
    say("The file couldn't be decrypted. Check that the link was copied in full.", true);

    return;
  }

  contents.value = new TextDecoder().decode(bytes);
  element("file").hidden = false;
  openButton.hidden = true;
  say("Here's the file. This link no longer works, so keep a copy now.");
}

async function copy() {
  try {
    await navigator.clipboard.writeText(contents.value);
    say("Copied.");
  } catch {
    contents.select();
    say("Couldn't copy automatically. The text is selected; copy it yourself.", true);
  }
}

function download() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  link.download = ".env";
  document.body.append(link);
  link.click();
  link.remove();
}

if (!linkComplete(key, id)) {
  say(
    "This link is incomplete. Ask the sender for the full link, including the part after #.",
    true,
  );
  openButton.hidden = true;
}

openButton.addEventListener("click", () => void open());

element("copy").addEventListener("click", () => void copy());

element("download").addEventListener("click", download);
