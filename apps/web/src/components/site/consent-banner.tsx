"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { useState, useSyncExternalStore } from "react";
import { DOCS_ROUTE } from "@/lib/routes.ts";

const BUTTON =
  "den-button inline-flex h-9 items-center px-4 text-sm font-medium transition-[background-color,border-color] duration-150 ease-out";

const unsubscribed = () => () => {};

// consent lives in the browser, so the server render never shows the banner
function consentPending() {
  return (
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) &&
    posthog.get_explicit_consent_status() === "pending"
  );
}

export function ConsentBanner() {
  const pending = useSyncExternalStore(unsubscribed, consentPending, () => false);
  const [chosen, setChosen] = useState(false);

  if (!pending || chosen) return null;

  const choose = (allow: boolean) => {
    if (allow) posthog.opt_in_capturing();
    else posthog.opt_out_capturing();

    setChosen(true);
  };

  return (
    <section
      aria-label="Cookie preferences"
      className="fixed right-4 bottom-4 left-4 z-50 max-w-md border border-den-line-strong bg-den-surface p-4 sm:left-auto"
    >
      <p className="text-sm text-den-ink">
        We use cookies to improve your experience and understand how the site is used.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => choose(true)}
          className={`${BUTTON} bg-den-lantern text-den-on-lantern hover:bg-[rgba(255,210,122,1)] active:bg-[rgba(228,170,66,1)]`}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          className={`${BUTTON} border border-den-line-strong text-den-ink hover:bg-den-raised`}
        >
          Decline
        </button>
        <Link
          href={`${DOCS_ROUTE}/telemetry#this-website`}
          className="den-link text-sm text-den-muted"
        >
          Learn more
        </Link>
      </div>
    </section>
  );
}
