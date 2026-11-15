import { join } from "node:path";
import { setup, password, kitSecret } from "../harness/onboarding.ts";
import type { IScenario } from "../harness/types.ts";

export default {
  name: "credentials",
  roles: ["server", "device-a"],
  async run(c) {
    const { kit } = await setup(c);
    const unlock = c.pty("device-a", ["unlock"]);
    await unlock.expect("Master password", "wrong password\r");
    await unlock.expect("Wrong master password. Try again", `${password}\r`);
    await c.finish("device-a", "unlock wrong then correct password", unlock);
    const change = c.pty("device-a", ["vault", "password", "change"]);
    const next = "a different correct master password";
    await change.expect("Old master password", `${password}\r`);
    await change.expect("Master password", `${next}\r`);
    await change.expect("Confirm master password", `${next}\r`);
    await change.expect("Recovery secret key", `${await kitSecret(kit)}\r`);
    await c.finish("device-a", "password change", change);
    const reset = c.pty("device-a", ["vault", "password", "reset"]);
    await reset.expect("Master password", `${password}\r`);
    await reset.expect("Confirm master password", `${password}\r`);
    await reset.expect("Recovery secret key", `${await kitSecret(kit)}\r`);
    await c.finish("device-a", "password reset", reset);

    const replace = c.pty("device-a", [
      "vault",
      "kit",
      "replace",
      "--kit-out",
      join(c.get("device-a").home, "new-kit.json"),
    ]);

    await replace.expect("Master password", `${password}\r`);
    await c.finish("device-a", "kit replace", replace);
    const rotate = c.pty("device-a", ["vault", "rotate"]);
    await rotate.expect("Master password", `${password}\r`);
    await c.finish("device-a", "vault rotate", rotate);
  },
} satisfies IScenario;
