"use client";

import { echoAction } from "@/components/landing/chrome/action.ts";
import { useEffect, useState } from "react";
import { Glyph } from "@/components/landing/ui/glyph.tsx";

interface ICopyCommand {
  command: string;
}

const COPIED_MS = 1600;

export function CopyCommand(props: ICopyCommand) {
  const { command } = props;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), COPIED_MS);

    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    echoAction(`copied: ${command}`);
  };

  return (
    <div className="flex h-11 max-w-full min-w-0 items-stretch border border-den-line-strong bg-den-ground font-mono text-[13px]">
      <code className="den-fade-right flex min-w-0 flex-1 items-center overflow-x-auto px-3.5 whitespace-nowrap text-den-ink [scrollbar-width:none]">
        <span className="mr-2 text-den-muted select-none">$</span>
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy the command"}
        className="flex w-11 shrink-0 items-center justify-center border-l border-den-line-strong text-den-muted transition-[background-color,color] duration-150 ease-out hover:bg-den-surface hover:text-den-ink active:bg-den-raised"
      >
        <span className="relative h-4 w-4" data-copied={copied}>
          <span className="den-copy-icon absolute inset-0" data-visible={!copied}>
            <Glyph name="copy" />
          </span>
          <span className="den-copy-icon absolute inset-0 text-den-lantern" data-visible={copied}>
            <Glyph name="check" />
          </span>
        </span>
      </button>
    </div>
  );
}
