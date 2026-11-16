import { devicesVault } from "./admin/devices-vault.ts";
import { maintenance } from "./admin/maintenance.ts";
import { errors } from "./basics/errors.ts";
import { help } from "./basics/help.ts";
import { localState } from "./basics/local-state.ts";
import { probe } from "./basics/probe.ts";
import { settings } from "./basics/settings.ts";
import { collision } from "./files/collision.ts";
import { fileOptions } from "./files/options.ts";
import { resolution } from "./files/resolution.ts";
import { symlink } from "./files/symlink.ts";
import { worktrees } from "./files/worktrees.ts";
import { onboardingErrors } from "./onboarding/errors.ts";
import { hostHere } from "./onboarding/host-here.ts";
import { localFileChoice } from "./onboarding/local-file-choice.ts";
import { lockedSession } from "./onboarding/locked-session.ts";
import { onboardingOptions } from "./onboarding/options.ts";
import { pairingSecret } from "./onboarding/pairing-secret.ts";
import { recoveryPdf } from "./onboarding/recovery-pdf.ts";
import { rejoinAfterRemoval } from "./onboarding/rejoin.ts";
import { interrupted } from "./server/interrupted.ts";
import { lost } from "./server/lost.ts";
import { move } from "./server/move.ts";
import { repairs } from "./server/repair.ts";
import { conflicts } from "./sync/conflict.ts";
import { pairing } from "./sync/pairing.ts";
import { recovery } from "./sync/recovery.ts";
import { sharedVault } from "./sync/shared-vault.ts";
import { unreachable } from "./sync/unreachable.ts";
import { userFlow } from "./sync/user-flow.ts";
import type { IScenario } from "./types.ts";

export const scenarios: IScenario[] = [
  probe,
  help,
  errors,
  settings,
  localState,
  userFlow,
  pairing,
  recovery,
  ...conflicts,
  sharedVault,
  unreachable,
  worktrees,
  symlink,
  fileOptions,
  resolution,
  collision,
  onboardingErrors,
  onboardingOptions,
  localFileChoice,
  rejoinAfterRemoval,
  pairingSecret,
  recoveryPdf,
  lockedSession,
  hostHere,
  devicesVault,
  maintenance,
  move,
  interrupted,
  ...repairs,
  lost,
];
