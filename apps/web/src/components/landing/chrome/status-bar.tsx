"use client";

import { useEffect, useRef, useState } from "react";
import { IDLE_STATUS, STATUS_SECTIONS } from "@/components/landing/chrome/sections.ts";
import { useCurrentSection } from "@/components/landing/chrome/use-current-section.ts";

export function StatusBar() {
  const current = useCurrentSection();
  const [echo, setEcho] = useState("");
  const nav = useRef<HTMLElement>(null);

  const status =
    echo || STATUS_SECTIONS.find((section) => section.id === current)?.status || IDLE_STATUS;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const receive = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") return;
      clearTimeout(timer);
      setEcho(event.detail);
      timer = setTimeout(() => setEcho(""), 1600);
    };

    window.addEventListener("den-action", receive);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("den-action", receive);
    };
  }, []);

  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
  }, [current]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-den-line bg-den-ground">
      <div className="den-frame flex min-h-11 flex-col items-stretch border-x-0 font-mono text-[11px] lg:flex-row">
        <p className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-3 text-den-muted sm:px-8">
          <span
            key={status}
            className="den-pulse h-1.5 w-1.5 shrink-0 bg-den-lantern"
            aria-hidden="true"
          />
          <output className="truncate">{status}</output>
        </p>
        <nav
          ref={nav}
          aria-label="Sections"
          className="den-tabs pointer-events-auto hidden overflow-x-auto sm:block"
        >
          <ul className="flex h-11">
            {STATUS_SECTIONS.map((section) => (
              <li key={section.id} className="shrink-0 border-l border-den-line">
                <a
                  href={`#${section.id}`}
                  aria-current={section.id === current ? "true" : undefined}
                  className="den-tab flex h-full items-center px-3 text-den-ink -outline-offset-2 hover:bg-den-surface aria-[current=true]:text-den-on-lantern"
                >
                  {section.tab}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
