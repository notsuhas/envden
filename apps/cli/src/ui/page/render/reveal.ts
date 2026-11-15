export function reveal(target: HTMLElement) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  target.dataset.flash = "false";
  requestAnimationFrame(() => (target.dataset.flash = "true"));
}
