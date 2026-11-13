"use client";

import { useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import { INSTALL_CHANNELS, defaultChannel } from "@/components/landing/install/channels.ts";
import { CopyCommand } from "@/components/landing/ui/copy-command.tsx";
import { stepTab } from "@/components/landing/ui/tabs/step.ts";

interface ICommandBox {
  name: string;
}

function subscribeNever() {
  return () => undefined;
}

// the server can't see the visitor's OS, so it renders the first tab
function serverChannel() {
  return 0;
}

function detectChannel() {
  return defaultChannel(navigator.userAgent);
}

export function CommandBox(props: ICommandBox) {
  const { name } = props;
  const [picked, setPicked] = useState<number>();
  const detected = useSyncExternalStore(subscribeNever, detectChannel, serverChannel);
  const active = picked ?? detected;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepTab(active, event.key, INSTALL_CHANNELS.length);
    if (next === active) return;

    event.preventDefault();
    setPicked(next);
    event.currentTarget.querySelectorAll<HTMLElement>("[role=tab]")[next]?.focus();
  };

  return (
    <div className="max-w-full min-w-0">
      <div
        role="tablist"
        aria-label="Install with"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-fit max-w-full overflow-x-auto border border-b-0 border-den-line-strong [scrollbar-width:none]"
      >
        {INSTALL_CHANNELS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${name}-tab-${item.id}`}
            aria-selected={index === active}
            aria-controls={`${name}-panel-${item.id}`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setPicked(index)}
            className="h-7 shrink-0 border-r border-den-line-strong px-2.5 font-mono text-[11px] text-den-muted -outline-offset-2 transition-[color,background-color] duration-150 ease-out last:border-r-0 hover:bg-den-surface hover:text-den-ink active:bg-den-raised aria-selected:bg-den-lantern aria-selected:text-den-on-lantern"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid">
        {INSTALL_CHANNELS.map((channel, index) => (
          <div
            key={channel.id}
            role="tabpanel"
            id={`${name}-panel-${channel.id}`}
            aria-labelledby={`${name}-tab-${channel.id}`}
            aria-hidden={index !== active}
            inert={index !== active}
            className={`col-start-1 row-start-1 grid content-start gap-2 ${index !== active ? "invisible" : ""}`}
          >
            {channel.commands.map((command) => (
              <CopyCommand key={command} command={command} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
