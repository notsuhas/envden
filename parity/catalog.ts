import localStateEdges from "./scenarios/local-state-edges.ts";
import collision from "./scenarios/files/collision.ts";
import localFileChoice from "./scenarios/onboarding/local-file-choice.ts";
import rejoin from "./scenarios/onboarding/rejoin.ts";
import hostHere from "./scenarios/onboarding/host-here.ts";
import onboardingOptions from "./scenarios/onboarding/options.ts";
import resolutionOptions from "./scenarios/files/resolution.ts";
import recoveryPdf from "./scenarios/onboarding/recovery-pdf.ts";
import fileOptions from "./scenarios/files/options.ts";
import lost from "./scenarios/server/lost.ts";
import interrupted from "./scenarios/server/interrupted.ts";
import userFlow from "./scenarios/onboarding/user-flow.ts";
import maintenance from "./scenarios/maintenance/run.ts";
import locked from "./scenarios/onboarding/locked-session.ts";
import secret from "./scenarios/onboarding/pairing-secret.ts";
import scenario0 from "./scenarios/files/checkouts.ts";
import scenario1 from "./scenarios/command-surface.ts";
import scenario2 from "./scenarios/credentials.ts";
import scenario3 from "./scenarios/invalid-input.ts";
import scenario4 from "./scenarios/pairing.ts";
import scenario5 from "./scenarios/server/move.ts";
import scenario6 from "./scenarios/server/repair.ts";
import scenario7 from "./scenarios/server/without.ts";
import scenario8 from "./scenarios/settings.ts";
import scenario9 from "./scenarios/sync.ts";
import scenario10 from "./scenarios/unreachable.ts";

if (
  process.env.PARITY_HOST_SHIMS === "1" &&
  (process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.platform !== "linux")
)
  throw new Error("Host shims require a disposable GitHub runner");

export const scenarios = [
  localStateEdges,
  collision,
  localFileChoice,
  rejoin,
  ...(process.env.PARITY_HOST_SHIMS === "1" ? [hostHere] : []),
  onboardingOptions,
  resolutionOptions,
  recoveryPdf,
  fileOptions,
  lost,
  interrupted,
  userFlow,
  maintenance,
  locked,
  secret,
  scenario0,
  scenario1,
  scenario2,
  scenario3,
  scenario4,
  scenario5,
  scenario6,
  scenario7,
  scenario8,
  scenario9,
  scenario10,
];
