"use client";

import { IDLE_STATUS, STATUS_SECTIONS } from "@/components/landing/chrome/sections.ts";
import { useCurrentSection } from "@/components/landing/chrome/use-current-section.ts";

export function StatusBar() {
  const current = useCurrentSection();
  const status = STATUS_SECTIONS.find((section) => section.id === current)?.status ?? IDLE_STATUS;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-den-line bg-den-ground">
      <div className="den-frame flex min-h-9 flex-col items-stretch lg:flex-row border-x-0 font-mono text-[11px]">
        <p className="hidden min-w-0 flex-1 items-center lg:flex gap-2.5 px-3 text-den-muted sm:px-8">
          <span
            className="den-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-den-lantern"
            aria-hidden="true"
          />
          <span key={status} className="den-status truncate">
            {status}
          </span>
        </p>
        <nav aria-label="Sections" className="pointer-events-auto overflow-x-auto">
          <ul className="flex h-9">
            {STATUS_SECTIONS.map((section) => (
              <li key={section.id} className="shrink-0 border-l border-den-line">
                <a
                  href={`#${section.id}`}
                  aria-current={section.id === current ? "true" : undefined}
                  className="flex h-full items-center px-3 text-den-ink -outline-offset-2 transition-[color,background-color] duration-150 ease-out hover:bg-den-surface active:bg-den-raised aria-[current=true]:bg-den-lantern aria-[current=true]:text-den-on-lantern"
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
