import { button, el } from "../dom.ts";

// Resolves to an error message to show beside the field, or undefined once renamed.
export type TRename = (name: string) => Promise<string | undefined>;

export function renameControl(current: string, rename: TRename): HTMLElement {
  const control = el("div", { className: "rename" });

  const closed = () =>
    control.replaceChildren(button("Rename", "quiet", "Rename this device", open));

  const open = () => {
    const input = el("input", { className: "input", label: "New name for this device" });
    const error = el("p", { className: "field-error" });
    const save = el("button", { className: "button small primary", text: "Save" });

    input.value = current;
    input.autocomplete = "off";
    input.spellcheck = false;
    error.setAttribute("aria-live", "polite");
    save.type = "submit";

    const form = el("form", { className: "rename-form" }, [
      el("div", { className: "row" }, [
        input,
        save,
        button("Cancel", "quiet", "Cancel renaming", closed),
      ]),
      error,
    ]);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";

      void rename(input.value).then((message) => {
        if (!message) return;
        error.textContent = message;
        input.focus();
      });
    });

    control.replaceChildren(form);
    input.focus();
    input.select();
  };

  closed();

  return control;
}
