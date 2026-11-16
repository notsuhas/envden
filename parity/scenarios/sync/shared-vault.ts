import { gatePairing } from "../../runtime/server/pairing-proxy.ts";
import { cli, edit } from "../steps/cli.ts";
import { joinKit, joinPair, setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

// With --mix --third, a, b and c run the reference, candidate and third implementations.
export const sharedVault: IScenario = {
  name: "shared-vault",
  roles: ["server", "a", "b", "c"],

  needs: "stand-in",
  steps: [
    ...setup({ front: (_, s) => gatePairing(s) }),
    joinKit("b"),
    joinPair("c"),
    edit("a", "TOKEN=from-a\nSHARED=1\n"),
    cli("a", ["push", "--yes"]),
    cli("b", ["pull", "--yes"]),
    cli("c", ["pull", "--yes"]),
    edit("c", "TOKEN=from-c\nSHARED=1\n"),
    cli("c", ["push", "--yes"]),
    edit("b", "TOKEN=from-b\nSHARED=1\n"),
    cli("b", ["pull", "--yes"], 3),
    cli("b", ["resolve", "--list", "--json"]),
    cli("a", ["pull", "--yes"]),
    cli("a", ["device", "ls", "--json"]),
    cli("b", ["status", "--json"]),
    cli("c", ["status", "--json"]),
  ],
};
