import { el } from "./dom.ts";

export function windowPane(title: string, badge: Node, lit: boolean, body: Node[]): HTMLElement {
  const handle = () => el("span", { className: "handle" });
  const hatch = () => el("span", { className: "hatch" });

  return el("figure", { className: "window", data: { lit: String(lit) } }, [
    el("figcaption", { className: "bar" }, [
      handle(),
      hatch(),
      el("span", { className: "title", text: title }),
      hatch(),
      badge,
      handle(),
    ]),
    el("div", { className: "pane" }, body),
  ]);
}
