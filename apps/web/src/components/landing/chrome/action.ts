export function echoAction(message: string): void {
  window.dispatchEvent(new CustomEvent("den-action", { detail: message }));
}
