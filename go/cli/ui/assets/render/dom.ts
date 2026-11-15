interface IElement {
  className?: string;
  text?: string;
  label?: string;
  data?: Record<string, string>;
}

// Text only, never HTML: paths, repo IDs and key names come from disk.
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: IElement = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.label) node.setAttribute("aria-label", props.label);
  Object.assign(node.dataset, props.data);
  node.append(...children);

  return node;
}

export function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);

  return node;
}

export function table(headings: string[], rows: Node[][]): HTMLTableElement {
  return el("table", {}, [
    el("thead", {}, [
      el(
        "tr",
        {},
        headings.map((text) => el("th", { text })),
      ),
    ]),
    el(
      "tbody",
      {},
      rows.map((cells) =>
        el(
          "tr",
          {},
          cells.map((cell) => el("td", {}, [cell])),
        ),
      ),
    ),
  ]);
}

export function button(
  text: string,
  tone: "quiet" | "primary" | "link",
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const node = el("button", {
    className: tone === "link" ? "link" : `button small ${tone}`,
    text,
    label,
  });

  node.type = "button";
  node.addEventListener("click", onClick);

  return node;
}
