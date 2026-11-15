import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// cookieless until the visitor accepts in the consent banner; replay and heatmaps only run after that
if (key)
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    cookieless_mode: "on_reject",
    capture_pageview: "history_change",
    capture_pageleave: true,
    session_recording: { maskAllInputs: true },
  });
