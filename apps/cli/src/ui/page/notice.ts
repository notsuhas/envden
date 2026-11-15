import { byId } from "./render/dom.ts";

export function notify(message: string, error = false) {
  const notice = byId("notice");
  notice.textContent = message;
  notice.dataset.error = String(error);
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

// One request at a time: every action button waits while the progress fill runs.
export async function busy(message: string, action: () => Promise<void>) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];

  for (const button of buttons) button.disabled = true;
  byId("progress").hidden = false;
  notify(message);

  try {
    await action();
  } catch (error) {
    notify(errorText(error), true);
  } finally {
    for (const button of buttons) button.disabled = false;
    byId("progress").hidden = true;
  }
}
