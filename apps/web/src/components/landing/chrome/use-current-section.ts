import { useEffect, useState } from "react";

export function useCurrentSection(): string | undefined {
  const [current, setCurrent] = useState<string>();

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-section]"));

    const update = () => {
      const section = sections.findLast(
        (item) => item.getBoundingClientRect().top <= window.innerHeight * 0.45,
      );

      setCurrent(section?.dataset.section);
    };

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return current;
}
