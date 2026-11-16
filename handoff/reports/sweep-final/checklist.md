# Final faithfulness sweep

Initial PENDING: 106


### apps/cli/src/commands/onboarding/join.ts:21 :: callback@21

DONE: Compared. GAP in protected onboarding routing: wrapper tests checkpoint.is_string instead of TS truthiness, then routes through run_join. Normal checkpoint string covered by existing rejoin tests. Owner files left untouched.

Ordered statements:

```ts
{
    const adapters = createAdapters(undefined, Date.now);
    const address = requireServerAddress(server);

    if ((await loadState(adapters.home))?.checkpoint) {
      await runRejoin(adapters, address, options, Date.now);

      return;
    }

    const state = await runJoin(adapters, address, options, Date.now);

    for (const line of joinSummary(state, await realHome(adapters.userHome))) console.log(line);
  }
```


### apps/cli/src/commands/onboarding/options.ts:4 :: withPreferences

DONE: program/commands.json includes telemetry/update-check on|off, shells in TS order plus none, and agent on|off; parser enforces choices.

Ordered statements:

```ts
{
  return command
    .addOption(new Option("--telemetry <choice>", "Anonymous telemetry").choices(TOGGLES))
    .addOption(new Option("--update-check <choice>", "Daily update check").choices(TOGGLES))
    .addOption(new Option("--shell <shell>", "Shell notice").choices([...SHELLS, "none"] as const))
    .addOption(new Option("--agent <choice>", "Install the agent skill").choices(TOGGLES));
}
```


### apps/cli/src/commands/onboarding/setup.ts:26 :: callback@26

DONE: Compared missing flag report then INVALID_INPUT before setup; passes adapters/options, obtains resulting state and prints summary with real home. Actual setup implementation belongs to onboarding owner.

Ordered statements:

```ts
{
    const missing = missingSetupFlags(!!process.stdin.isTTY, options);

    if (missing.length) {
      console.error(`Missing choices: ${missing.join(", ")}. Or run setup in your own terminal.`);

      throw new EnvdenError("INVALID_INPUT", "Setup choices require your own terminal");
    }

    const adapters = createAdapters(undefined, Date.now);
    const state = await runSetup(adapters, options, Date.now);

    for (const line of setupSummary(state, await realHome(adapters.userHome))) console.log(line);
  }
```


### apps/cli/src/commands/onboarding/unlock.ts:8 :: callback@8

DONE: Rust commands/onboarding/unlock.rs prompts Master password, then Wrong master password. Try again on retry, calls unlock_device, prints Unlocked only on success.

Ordered statements:

```ts
{
    await unlockDevice(
      createAdapters(undefined, Date.now),
      (retry) => secret(retry ? "Wrong master password. Try again" : "Master password"),
      Date.now,
      fetch,
    );

    console.log("Unlocked");
  }
```


### apps/cli/src/commands/onboarding/unlock.ts:11 :: callback@11

DONE: Rust commands/onboarding/unlock.rs prompts Master password, then Wrong master password. Try again on retry, calls unlock_device, prints Unlocked only on success.

Ordered statements:

```ts
secret(retry ? "Wrong master password. Try again" : "Master password")
```


### apps/cli/src/commands/shell/shell.ts:19 :: callback@19

DONE: Rust commands/shell/run.rs selects the supplied shell or prompts with the same ordered choices, skips none, installs with executable or uninstalls. No stdout on success.

Ordered statements:

```ts
{
        await manageShell(
          createAdapters(undefined, Date.now),
          action,
          shell ?? (await shellChoice()),
        );
      }
```


### apps/cli/src/commands/ui/ui.ts:10 :: callback@10

DONE: Rust commands/ui/run.rs forwards terminal, parsed port, and default-open=true; ui/start.rs registers both interrupt and terminate and prints URL then stop text. Forced-stop difference remains under runDashboard.

Ordered statements:

```ts
{
    await runDashboard(createAdapters(undefined, Date.now), {
      interactive: !!process.stdin.isTTY,
      ...(options.port === undefined ? {} : { port: options.port }),
      now: Date.now,
      report: (line) => console.log(line),
      ...(options.open ? { open: openBrowser } : {}),
      stopped: interrupted(),
    });
  }
```


### apps/cli/src/commands/ui/ui.ts:15 :: callback@15

DONE: Rust commands/ui/run.rs forwards terminal, parsed port, and default-open=true; ui/start.rs registers both interrupt and terminate and prints URL then stop text. Forced-stop difference remains under runDashboard.

Ordered statements:

```ts
console.log(line)
```


### apps/cli/src/commands/ui/ui.ts:21 :: interrupted

DONE: Rust commands/ui/run.rs forwards terminal, parsed port, and default-open=true; ui/start.rs registers both interrupt and terminate and prints URL then stop text. Forced-stop difference remains under runDashboard.

Ordered statements:

```ts
{
  return new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}
```


### apps/cli/src/commands/ui/ui.ts:22 :: callback@22

DONE: Rust commands/ui/run.rs forwards terminal, parsed port, and default-open=true; ui/start.rs registers both interrupt and terminate and prints URL then stop text. Forced-stop difference remains under runDashboard.

Ordered statements:

```ts
{
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  }
```


### apps/cli/src/commands/vault/output.ts:10 :: reportReplacementKit

DONE: da338e7d. Rust constructs output with shown=false, treats missing/empty path as PDF, reads state before hostname fallback and clock, writes JSON exclusively otherwise, prints success or fallback kit, sets shown only after reporting, warns only if previously shown and rethrows original failure. red-kit.log then green-kit.log.

Ordered statements:

```ts
{
  if (!path) {
    const deviceName = (await loadState(adapters.home))?.deviceName ?? adapters.hostname;

    return reportKit(kit, { userHome: adapters.userHome, deviceName, now: adapters.now() });
  }

  try {
    await writeKit(path, kit);
    printKitSaved(path, "json");
  } catch {
    console.error("envden: Could not save the recovery kit; save the kit printed below");
    printKit(kit);
  }
}
```


### apps/cli/src/commands/vault/output.ts:30 :: replacementKitOutput

DONE: da338e7d. Rust constructs output with shown=false, treats missing/empty path as PDF, reads state before hostname fallback and clock, writes JSON exclusively otherwise, prints success or fallback kit, sets shown only after reporting, warns only if previously shown and rethrows original failure. red-kit.log then green-kit.log.

Ordered statements:

```ts
{
  let shown = false;

  return {
    show: async (kit: IReplacementKit) => {
      await reportReplacementKit(adapters, kit, path);
      shown = true;
    },
    fail: (error: unknown): never => {
      if (shown)
        console.error(
          "envden: The new recovery kit is not confirmed yet. Keep the old kit too, and rerun this command to finish.",
        );

      throw error;
    },
  };
}
```


### apps/cli/src/commands/vault/output.ts:34 :: callback@34

DONE: da338e7d. Rust constructs output with shown=false, treats missing/empty path as PDF, reads state before hostname fallback and clock, writes JSON exclusively otherwise, prints success or fallback kit, sets shown only after reporting, warns only if previously shown and rethrows original failure. red-kit.log then green-kit.log.

Ordered statements:

```ts
{
      await reportReplacementKit(adapters, kit, path);
      shown = true;
    }
```


### apps/cli/src/commands/vault/output.ts:38 :: callback@38

DONE: da338e7d. Rust constructs output with shown=false, treats missing/empty path as PDF, reads state before hostname fallback and clock, writes JSON exclusively otherwise, prints success or fallback kit, sets shown only after reporting, warns only if previously shown and rethrows original failure. red-kit.log then green-kit.log.

Ordered statements:

```ts
{
      if (shown)
        console.error(
          "envden: The new recovery kit is not confirmed yet. Keep the old kit too, and rerun this command to finish.",
        );

      throw error;
    }
```


### apps/cli/src/commands/vault/run.ts:39 :: callback@39

DONE: Rust commands/vault/run.rs matches rotate/change/reset prompt and request order: master; old then confirmed new then kit; confirmed new then kit. Replacement constructs output, prompts, calls replace, reports shown-kit failure, prints finished/replaced branch after success.

Ordered statements:

```ts
{
    await rotateVault(adapters, await prompt("Master password"), now);
    console.log("Vault re-keyed; removed devices can't read new changes");
  }
```


### apps/cli/src/commands/vault/run.ts:43 :: callback@43

DONE: Rust commands/vault/run.rs matches rotate/change/reset prompt and request order: master; old then confirmed new then kit; confirmed new then kit. Replacement constructs output, prompts, calls replace, reports shown-kit failure, prints finished/replaced branch after success.

Ordered statements:

```ts
{
    await changePassword(
      adapters,
      await prompt("Old master password"),
      await confirmedPassword(prompt),
      await prompt("Recovery secret key"),
      now,
    );

    console.log("Password changed; the kit stays valid");
  }
```


### apps/cli/src/commands/vault/run.ts:54 :: callback@54

DONE: Rust commands/vault/run.rs matches rotate/change/reset prompt and request order: master; old then confirmed new then kit; confirmed new then kit. Replacement constructs output, prompts, calls replace, reports shown-kit failure, prints finished/replaced branch after success.

Ordered statements:

```ts
{
    await resetPassword(
      adapters,
      await confirmedPassword(prompt),
      await prompt("Recovery secret key"),
      now,
    );

    console.log("Password reset; the kit stays valid");
  }
```


### apps/cli/src/commands/vault/vault.ts:10 :: callback@10

DONE: program/commands.json and DefaultActions dispatch map rotate, kit replace --kit-out, password change/reset to matching action. Metadata checked against frozen TS declarations.

Ordered statements:

```ts
{
        await runVaultAdmin(createAdapters(undefined, Date.now), "rotate", Date.now);
      }
```


### apps/cli/src/commands/vault/vault.ts:22 :: callback@22

DONE: program/commands.json and DefaultActions dispatch map rotate, kit replace --kit-out, password change/reset to matching action. Metadata checked against frozen TS declarations.

Ordered statements:

```ts
{
          await runVaultAdmin(
            createAdapters(undefined, Date.now),
            "replace",
            Date.now,
            undefined,
            options.kitOut,
          );
        }
```


### apps/cli/src/commands/vault/vault.ts:39 :: callback@39

DONE: program/commands.json and DefaultActions dispatch map rotate, kit replace --kit-out, password change/reset to matching action. Metadata checked against frozen TS declarations.

Ordered statements:

```ts
{
            await runVaultAdmin(createAdapters(undefined, Date.now), "change", Date.now);
          }
```


### apps/cli/src/commands/vault/vault.ts:46 :: callback@46

DONE: program/commands.json and DefaultActions dispatch map rotate, kit replace --kit-out, password change/reset to matching action. Metadata checked against frozen TS declarations.

Ordered statements:

```ts
{
            await runVaultAdmin(createAdapters(undefined, Date.now), "reset", Date.now);
          }
```


### apps/cli/src/links/discovery/repos.ts:36 :: discoverRepos

DONE: 38ae2d9d. Exclusions and home resolve before roots; root callbacks lexically resolve without redundant realpath. Each filesystem batch canonicalizes once, filters unseen/excluded before readdir, identifies git roots with an eight-call bound, adds/progresses before related listing, fully collects registered worktrees/submodules before descent, walks visible child folders only when allowed, and stable-sorts roots with ICU locale collation. Submodules mark visited before directory reads and collect directly without a second scan. Vec map replacement preserves first insertion for collation-equal roots. red-discovery-order.log fails before fix; green-discovery.log passes all five discovery tests.

Ordered statements:

```ts
{
  const excludes = await Promise.all((scope.excluded ?? []).map(realOrResolved));
  const home = scope.home === undefined ? undefined : await realOrResolved(scope.home);

  const walk: IWalk = {
    repo,
    found: new Map(),
    visited: new Set(),
    excludes,
    home,
    events,
    git: pLimit(GIT_CONCURRENCY),
    fs: pLimit(FS_CONCURRENCY),
  };

  await Promise.all(scope.roots.map((root) => walkFolder(walk, resolve(root), true)));

  // folders finish in any order, so sort for a stable list
  return [...walk.found.values()].sort((a, b) => a.root.localeCompare(b.root));
}
```


### apps/cli/src/links/discovery/repos.ts:55 :: callback@55

DONE: 38ae2d9d. Exclusions and home resolve before roots; root callbacks lexically resolve without redundant realpath. Each filesystem batch canonicalizes once, filters unseen/excluded before readdir, identifies git roots with an eight-call bound, adds/progresses before related listing, fully collects registered worktrees/submodules before descent, walks visible child folders only when allowed, and stable-sorts roots with ICU locale collation. Submodules mark visited before directory reads and collect directly without a second scan. Vec map replacement preserves first insertion for collation-equal roots. red-discovery-order.log fails before fix; green-discovery.log passes all five discovery tests.

Ordered statements:

```ts
walkFolder(walk, resolve(root), true)
```


### apps/cli/src/links/discovery/repos.ts:58 :: callback@58

DONE: 38ae2d9d. Exclusions and home resolve before roots; root callbacks lexically resolve without redundant realpath. Each filesystem batch canonicalizes once, filters unseen/excluded before readdir, identifies git roots with an eight-call bound, adds/progresses before related listing, fully collects registered worktrees/submodules before descent, walks visible child folders only when allowed, and stable-sorts roots with ICU locale collation. Submodules mark visited before directory reads and collect directly without a second scan. Vec map replacement preserves first insertion for collation-equal roots. red-discovery-order.log fails before fix; green-discovery.log passes all five discovery tests.

Ordered statements:

```ts
a.root.localeCompare(b.root)
```


### apps/cli/src/links/fork.ts:29 :: vaultRepos

DONE: Compared. GAP in protected onboarding/scan.rs vault_repos: skips syncContext handshake/session/chain refresh and derives names from checkpoint_material instead. Reported for onboarding owner; no edit.

Ordered statements:

```ts
{
  if (!state.checkpoint) return new Set<string>();
  const context = await syncContext(adapters, { now, fetcher: adapters.fetcher, all: true });

  return new Set(
    readableEntries(context)
      .filter((entry) => entry.state === 1 || entry.state === 3)
      .map((entry) => entryName(context, entry).repoId),
  );
}
```


### apps/cli/src/links/fork.ts:35 :: callback@35

DONE: Compared. GAP in protected onboarding/scan.rs vault_repos: skips syncContext handshake/session/chain refresh and derives names from checkpoint_material instead. Reported for onboarding owner; no edit.

Ordered statements:

```ts
entry.state === 1 || entry.state === 3
```


### apps/cli/src/links/fork.ts:36 :: callback@36

DONE: Compared. GAP in protected onboarding/scan.rs vault_repos: skips syncContext handshake/session/chain refresh and derives names from checkpoint_material instead. Reported for onboarding owner; no edit.

Ordered statements:

```ts
entryName(context, entry).repoId
```


### apps/cli/src/links/takeover/group.ts:10 :: groupOwnLinks

DONE: a65426ee. Insert links into groups by first target appearance; stable ICU target sort; stable destinations sort with main clone before registered worktrees then joined destination locale order. Rust preserves insertion for equal group/destination comparisons. Locale fixture red-locale.log then green-locale.log.

Ordered statements:

```ts
{
  const groups = new Map<string, IOwnLink[]>();

  for (const link of links) groups.set(link.target, [...(groups.get(link.target) ?? []), link]);

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([target, items]) => ({ target, links: items.toSorted(byDestination) }));
}
```


### apps/cli/src/links/takeover/group.ts:16 :: callback@16

DONE: a65426ee. Insert links into groups by first target appearance; stable ICU target sort; stable destinations sort with main clone before registered worktrees then joined destination locale order. Rust preserves insertion for equal group/destination comparisons. Locale fixture red-locale.log then green-locale.log.

Ordered statements:

```ts
a.localeCompare(b)
```


### apps/cli/src/links/takeover/group.ts:17 :: callback@17

DONE: a65426ee. Insert links into groups by first target appearance; stable ICU target sort; stable destinations sort with main clone before registered worktrees then joined destination locale order. Rust preserves insertion for equal group/destination comparisons. Locale fixture red-locale.log then green-locale.log.

Ordered statements:

```ts
({ target, links: items.toSorted(byDestination) })
```


### apps/cli/src/links/takeover/group.ts:35 :: byDestination

DONE: a65426ee. Insert links into groups by first target appearance; stable ICU target sort; stable destinations sort with main clone before registered worktrees then joined destination locale order. Rust preserves insertion for equal group/destination comparisons. Locale fixture red-locale.log then green-locale.log.

Ordered statements:

```ts
{
  return (
    Number(!!a.checkout.registeredWorktree) - Number(!!b.checkout.registeredWorktree) ||
    join(a.checkout.root, a.path).localeCompare(join(b.checkout.root, b.path))
  );
}
```


### apps/cli/src/main.ts:34 :: callback@34

DONE: Compiled Rust telemetry-send branch bypasses normal state/update/notices; normal execution routes output through explicit sanitized sinks. Parser-only update scope omission cannot make an authenticated request; no observed request/order difference on those branches. See remaining output/errors entries for sink review limits.

Ordered statements:

```ts
runCli(Date.now)
```


### apps/cli/src/output/errors.ts:4 :: withTerminalErrors

DONE: 23da1009. Rust uses lexical shared stdout/stderr sinks across the command library: stdout strips controls while preserving newline/tab; stderr formats all arguments then strips controls. Prompt/spinner native streams bypass these sinks, as TS Clack does. No mutable global console requires restoration; typed Rust commands render structures before logging. console.info/table have no production TS callers outside this wrapper. Recursive terminal JSON sanitization retains keys and sanitizes string values. red-sinks.log fails with control-bearing library notice; green-sinks.log passes.

Ordered statements:

```ts
{
  const log = console.log;
  const info = console.info;
  const table = console.table;
  console.log = (...values: unknown[]) => log(...values.map(sanitizeValue));
  console.info = (...values: unknown[]) => info(...values.map(sanitizeValue));

  console.table = (data: unknown, properties?: string[]) =>
    properties
      ? table(sanitizeValue(data), properties.map(sanitizeTerminal))
      : table(sanitizeValue(data));

  const report = console.error;
  console.error = (...values: unknown[]) => report(sanitizeTerminal(format(...values)));

  try {
    return await action();
  } finally {
    console.error = report;
    console.log = log;
    console.info = info;
    console.table = table;
  }
}
```


### apps/cli/src/output/errors.ts:8 :: callback@8

DONE: 23da1009. Rust uses lexical shared stdout/stderr sinks across the command library: stdout strips controls while preserving newline/tab; stderr formats all arguments then strips controls. Prompt/spinner native streams bypass these sinks, as TS Clack does. No mutable global console requires restoration; typed Rust commands render structures before logging. console.info/table have no production TS callers outside this wrapper. Recursive terminal JSON sanitization retains keys and sanitizes string values. red-sinks.log fails with control-bearing library notice; green-sinks.log passes.

Ordered statements:

```ts
log(...values.map(sanitizeValue))
```


### apps/cli/src/output/errors.ts:9 :: callback@9

DONE: 23da1009. Rust uses lexical shared stdout/stderr sinks across the command library: stdout strips controls while preserving newline/tab; stderr formats all arguments then strips controls. Prompt/spinner native streams bypass these sinks, as TS Clack does. No mutable global console requires restoration; typed Rust commands render structures before logging. console.info/table have no production TS callers outside this wrapper. Recursive terminal JSON sanitization retains keys and sanitizes string values. red-sinks.log fails with control-bearing library notice; green-sinks.log passes.

Ordered statements:

```ts
info(...values.map(sanitizeValue))
```


### apps/cli/src/output/errors.ts:11 :: callback@11

DONE: 23da1009. Rust uses lexical shared stdout/stderr sinks across the command library: stdout strips controls while preserving newline/tab; stderr formats all arguments then strips controls. Prompt/spinner native streams bypass these sinks, as TS Clack does. No mutable global console requires restoration; typed Rust commands render structures before logging. console.info/table have no production TS callers outside this wrapper. Recursive terminal JSON sanitization retains keys and sanitizes string values. red-sinks.log fails with control-bearing library notice; green-sinks.log passes.

Ordered statements:

```ts
properties
      ? table(sanitizeValue(data), properties.map(sanitizeTerminal))
      : table(sanitizeValue(data))
```


### apps/cli/src/output/errors.ts:17 :: callback@17

DONE: 23da1009. Rust uses lexical shared stdout/stderr sinks across the command library: stdout strips controls while preserving newline/tab; stderr formats all arguments then strips controls. Prompt/spinner native streams bypass these sinks, as TS Clack does. No mutable global console requires restoration; typed Rust commands render structures before logging. console.info/table have no production TS callers outside this wrapper. Recursive terminal JSON sanitization retains keys and sanitizes string values. red-sinks.log fails with control-bearing library notice; green-sinks.log passes.

Ordered statements:

```ts
report(sanitizeTerminal(format(...values)))
```


### apps/cli/src/output/errors.ts:29 :: sanitizeValue

DONE: 23da1009. Rust uses lexical shared stdout/stderr sinks across the command library: stdout strips controls while preserving newline/tab; stderr formats all arguments then strips controls. Prompt/spinner native streams bypass these sinks, as TS Clack does. No mutable global console requires restoration; typed Rust commands render structures before logging. console.info/table have no production TS callers outside this wrapper. Recursive terminal JSON sanitization retains keys and sanitizes string values. red-sinks.log fails with control-bearing library notice; green-sinks.log passes.

Ordered statements:

```ts
{
  if (typeof value === "string") return sanitizeConsole(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);

  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [sanitizeTerminal(key), sanitizeValue(item)]),
    );

  return value;
}
```


### apps/cli/src/output/errors.ts:35 :: callback@35

DONE: 23da1009. Rust uses lexical shared stdout/stderr sinks across the command library: stdout strips controls while preserving newline/tab; stderr formats all arguments then strips controls. Prompt/spinner native streams bypass these sinks, as TS Clack does. No mutable global console requires restoration; typed Rust commands render structures before logging. console.info/table have no production TS callers outside this wrapper. Recursive terminal JSON sanitization retains keys and sanitizes string values. red-sinks.log fails with control-bearing library notice; green-sinks.log passes.

Ordered statements:

```ts
[sanitizeTerminal(key), sanitizeValue(item)]
```


### apps/cli/src/output/home-path.ts:4 :: homePath

DONE: 43d28f95: resolves both arguments and normalizes dot segments before containment; retains original outside path. red-home.log failed before fix; green-home.log passed.

Ordered statements:

```ts
{
  const rest = relative(userHome, path);

  if (rest === "") return "~";
  if (rest === ".." || rest.startsWith(`..${sep}`) || isAbsolute(rest)) return path;

  return `~${sep}${rest}`;
}
```


### apps/cli/src/output/progress/scan.ts:10 :: callback@10

DONE: These three source callbacks are the silent found/done/abort functions. Rust IScanProgress enabled=false returns from each without reads/writes/output, matching each empty TS body. The animated spinner implementation is outside these callbacks.

Ordered statements:

```ts
{}
```


### apps/cli/src/output/progress/scan.ts:10 :: callback@10

DONE: These three source callbacks are the silent found/done/abort functions. Rust IScanProgress enabled=false returns from each without reads/writes/output, matching each empty TS body. The animated spinner implementation is outside these callbacks.

Ordered statements:

```ts
{}
```


### apps/cli/src/output/progress/scan.ts:10 :: callback@10

DONE: These three source callbacks are the silent found/done/abort functions. Rust IScanProgress enabled=false returns from each without reads/writes/output, matching each empty TS body. The animated spinner implementation is outside these callbacks.

Ordered statements:

```ts
{}
```


### apps/cli/src/output/prompts/device-name.ts:4 :: askDeviceName

DONE: Compared to protected onboarding/setup.rs device_name: supplied name returns unchanged; otherwise derive suggested name, prompt only when interactive, return suggestion unattended. GAP in hostname input: Rust invokes the hostname executable instead of reading the already-created adapter hostname passed by TS. Reported to onboarding owner.

Ordered statements:

```ts
{
  if (name !== undefined) return name;

  const suggested = suggestedDeviceName(hostname);

  return interactive ? input("Device name", true, suggested) : suggested;
}
```


### apps/cli/src/output/prompts/questions.ts:56 :: shellChoice

DONE: Rust commands/shell/run.rs and commands/sync/resolve.rs supply same message and ordered values/labels; output/prompts checks terminal before opening, selects one answer, cancellation returns INVALID_INPUT Cancelled.

Ordered statements:

```ts
{
  const message =
    "Install the shell notice? It prints a line when you cd into a checkout whose env files need a push or pull";

  terminal(message);

  return answer<"zsh" | "bash" | "fish" | "powershell" | "none">(
    await select({
      message,
      options: [
        { value: "zsh" as const, label: "zsh" },
        { value: "bash" as const, label: "bash" },
        { value: "fish" as const, label: "fish" },
        { value: "powershell" as const, label: "PowerShell" },
        { value: "none" as const, label: "No, skip it" },
      ],
    }),
  );
}
```


### apps/cli/src/output/prompts/questions.ts:76 :: chooseResolution

DONE: Rust commands/shell/run.rs and commands/sync/resolve.rs supply same message and ordered values/labels; output/prompts checks terminal before opening, selects one answer, cancellation returns INVALID_INPUT Cancelled.

Ordered statements:

```ts
{
  const message = `${sanitizeTerminal(path)} differs from the server's copy`;
  terminal(message);

  return answer<"keep-mine" | "take-server" | "merge">(
    await select({
      message,
      options: [
        { value: "keep-mine" as const, label: "Keep mine" },
        { value: "take-server" as const, label: "Take the server's" },
        { value: "merge" as const, label: "Merge both" },
      ],
    }),
  );
}
```


### apps/cli/src/output/render/sync/conflicts.ts:16 :: conflictNotice

DONE: Rust conflicts/record.rs constructs notice, conflicts/render.rs renders list and saved variants; commands/sync/resolve.rs renders resolved result. 74f0d272 adds omitted placementReports before backup notice, with red-resolved.log then green-resolved.log. Tombstone/absent precedence is equivalent because TS converts the distinct sides union first; no precedence bug. GAP in protected render.rs: variant parser accepts +1 unlike the TS digit-only suffix regex; report to sync owner.

Ordered statements:

```ts
{
  const { path, file } = notice;

  const next = notice.marked
    ? `Edit ${file}, then run envden resolve ${path}`
    : `Run envden resolve ${path} with --keep-mine or --take-server, or edit ${file} first`;

  return `Conflict in ${path}: ${conflictCause(notice)}. ${next}`;
}
```


### apps/cli/src/output/render/sync/conflicts.ts:26 :: conflictCause

DONE: Rust conflicts/record.rs constructs notice, conflicts/render.rs renders list and saved variants; commands/sync/resolve.rs renders resolved result. 74f0d272 adds omitted placementReports before backup notice, with red-resolved.log then green-resolved.log. Tombstone/absent precedence is equivalent because TS converts the distinct sides union first; no precedence bug. GAP in protected render.rs: variant parser accepts +1 unlike the TS digit-only suffix regex; report to sync owner.

Ordered statements:

```ts
{
  const where = notice.device ?? "the server";

  if (notice.theirs === "absent") return "this device has two different versions";
  if (notice.theirs === "tombstone") return `deleted on ${where} and changed here`;
  if (notice.mine === "deleted") return `deleted here and changed on ${where}`;
  if (notice.keys?.length) return `${notice.keys.join(", ")} changed here and on ${where}`;

  return `changed here and on ${where}`;
}
```


### apps/cli/src/output/render/sync/conflicts.ts:37 :: conflictsText

DONE: Rust conflicts/record.rs constructs notice, conflicts/render.rs renders list and saved variants; commands/sync/resolve.rs renders resolved result. 74f0d272 adds omitted placementReports before backup notice, with red-resolved.log then green-resolved.log. Tombstone/absent precedence is equivalent because TS converts the distinct sides union first; no precedence bug. GAP in protected render.rs: variant parser accepts +1 unlike the TS digit-only suffix regex; report to sync owner.

Ordered statements:

```ts
{
  if (!records.length) return "No conflicts";

  const lines = records.map((record) =>
    [
      `  ${join(record.root, record.path)}${sideNote(record)}`,
      `    edit ${record.file}`,
      ...record.alternatives.map((path) => `    saved ${savedSource(record, path)}: ${path}`),
    ].join("\n"),
  );

  return sanitizeConsole(
    [
      "Conflicts:",
      ...lines,
      "Edit the file, then run envden resolve <file>, or pass --keep-mine or --take-server",
    ].join("\n"),
  );
}
```


### apps/cli/src/output/render/sync/conflicts.ts:40 :: callback@40

DONE: Rust conflicts/record.rs constructs notice, conflicts/render.rs renders list and saved variants; commands/sync/resolve.rs renders resolved result. 74f0d272 adds omitted placementReports before backup notice, with red-resolved.log then green-resolved.log. Tombstone/absent precedence is equivalent because TS converts the distinct sides union first; no precedence bug. GAP in protected render.rs: variant parser accepts +1 unlike the TS digit-only suffix regex; report to sync owner.

Ordered statements:

```ts
[
      `  ${join(record.root, record.path)}${sideNote(record)}`,
      `    edit ${record.file}`,
      ...record.alternatives.map((path) => `    saved ${savedSource(record, path)}: ${path}`),
    ].join("\n")
```


### apps/cli/src/output/render/sync/conflicts.ts:44 :: callback@44

DONE: Rust conflicts/record.rs constructs notice, conflicts/render.rs renders list and saved variants; commands/sync/resolve.rs renders resolved result. 74f0d272 adds omitted placementReports before backup notice, with red-resolved.log then green-resolved.log. Tombstone/absent precedence is equivalent because TS converts the distinct sides union first; no precedence bug. GAP in protected render.rs: variant parser accepts +1 unlike the TS digit-only suffix regex; report to sync owner.

Ordered statements:

```ts
`    saved ${savedSource(record, path)}: ${path}`
```


### apps/cli/src/output/render/sync/conflicts.ts:57 :: resolvedText

DONE: Rust conflicts/record.rs constructs notice, conflicts/render.rs renders list and saved variants; commands/sync/resolve.rs renders resolved result. 74f0d272 adds omitted placementReports before backup notice, with red-resolved.log then green-resolved.log. Tombstone/absent precedence is equivalent because TS converts the distinct sides union first; no precedence bug. GAP in protected render.rs: variant parser accepts +1 unlike the TS digit-only suffix regex; report to sync owner.

Ordered statements:

```ts
{
  return sanitizeConsole(
    [
      `Resolved ${result.path}`,
      ...result.placementReports,
      ...(result.preserved.length ? [`Backups saved in ${result.backups}`] : []),
    ].join("\n"),
  );
}
```


### apps/cli/src/output/render/sync/conflicts.ts:68 :: savedSource

DONE: Rust conflicts/record.rs constructs notice, conflicts/render.rs renders list and saved variants; commands/sync/resolve.rs renders resolved result. 74f0d272 adds omitted placementReports before backup notice, with red-resolved.log then green-resolved.log. Tombstone/absent precedence is equivalent because TS converts the distinct sides union first; no precedence bug. GAP in protected render.rs: variant parser accepts +1 unlike the TS digit-only suffix regex; report to sync owner.

Ordered statements:

```ts
{
  const index = Number(/\.variant-(\d+)$/.exec(path)?.[1]);
  if (index === 0) return "this device";
  if (index === 1) return "server";
  const target = record.targets[index - 2];

  return target ? join(target.root, record.path) : "copy";
}
```


### apps/cli/src/output/render/sync/conflicts.ts:77 :: sideNote

DONE: Rust conflicts/record.rs constructs notice, conflicts/render.rs renders list and saved variants; commands/sync/resolve.rs renders resolved result. 74f0d272 adds omitted placementReports before backup notice, with red-resolved.log then green-resolved.log. Tombstone/absent precedence is equivalent because TS converts the distinct sides union first; no precedence bug. GAP in protected render.rs: variant parser accepts +1 unlike the TS digit-only suffix regex; report to sync owner.

Ordered statements:

```ts
{
  if (record.deleted) return " (deleted on the server)";

  return record.mineDeleted ? " (deleted here)" : "";
}
```


### apps/cli/src/output/telemetry/background.ts:7 :: selfCommand

DONE: Compiled Rust uses its executable plus telemetry-send, private child env, ignored streams and detached process group. Spawn errors ignored. Source-only bun argv branch has no Rust source-runtime equivalent.

Ordered statements:

```ts
{
  const compiled = /^(\/\$bunfs\/|[A-Z]:\\~BUN\\)/.test(argv[1] ?? "");

  return [execPath, ...(compiled ? [] : [argv[1]!]), TELEMETRY_SEND_COMMAND];
}
```


### apps/cli/src/output/telemetry/background.ts:14 :: sendInBackground

DONE: Compiled Rust uses its executable plus telemetry-send, private child env, ignored streams and detached process group. Spawn errors ignored. Source-only bun argv branch has no Rust source-runtime equivalent.

Ordered statements:

```ts
{
  try {
    const child = spawnTrusted(selfCommand(process.argv, process.execPath), {
      stdout: "ignore",
      stderr: "ignore",
      env: childEnvironment(body),
    });

    child.unref();
  } catch {
    // telemetry never affects a command's outcome
  }
}
```


### apps/cli/src/output/telemetry/background.ts:35 :: callback@35

DONE: Compiled Rust uses its executable plus telemetry-send, private child env, ignored streams and detached process group. Spawn errors ignored. Source-only bun argv branch has no Rust source-runtime equivalent.

Ordered statements:

```ts
[name, name.toLowerCase()]
```


### apps/cli/src/output/telemetry/report.ts:73 :: commandOutcome

DONE: program/dispatch.rs wraps action and reporting inside with_command_counts; result controls success/error code; report_telemetry ignores report failures and preserves original action result. Async scheduling differs in runtime but command result is preserved.

Ordered statements:

```ts
{
  try {
    const result = await action();
    void report({ success: true }).catch(() => {});

    return result;
  } catch (cause) {
    void report({
      success: false,
      errorCode: isEnvdenError(cause) ? cause.code : "INTERNAL",
    }).catch(() => {});

    throw cause;
  }
}
```


### apps/cli/src/output/telemetry/report.ts:79 :: callback@79

DONE: program/dispatch.rs wraps action and reporting inside with_command_counts; result controls success/error code; report_telemetry ignores report failures and preserves original action result. Async scheduling differs in runtime but command result is preserved.

Ordered statements:

```ts
{}
```


### apps/cli/src/output/telemetry/report.ts:86 :: callback@86

DONE: program/dispatch.rs wraps action and reporting inside with_command_counts; result controls success/error code; report_telemetry ignores report failures and preserves original action result. Async scheduling differs in runtime but command result is preserved.

Ordered statements:

```ts
{}
```


### apps/cli/src/program.ts:38 :: createProgram

DONE: Compared program/commands.json, parser, dispatch and counts scope against createProgram. Command registration/group/order/help/choices come from the frozen metadata; help integration compares every command to compiled TS. Notice errors are ignored, state roots are loaded before notice/action, telemetry records action result and counts and skips refreshCache. Child async scheduling uses synchronous Rust best-effort report, preserving outcomes.

Ordered statements:

```ts
{
  const program = new Command()
    .name("envden")
    .description("Encrypted whole-file env sync over your private network")
    .version(VERSION)
    .configureOutput({ outputError: (message, write) => write(sanitizeTerminal(message) + "\n") });

  let active: CommandUnknownOpts | undefined;

  program.hook("preAction", async (_program, command) => {
    const commandTime = now();

    const state = await loadState(createAdapters(undefined, now).home).catch(() => undefined);
    setUntrustedRoots(state?.approved.map((checkout) => checkout.root) ?? []);
    if (command.name() !== "status" || !command.opts().refreshCache) active = command;

    if (skipsNotices(command.name(), Boolean(command.opts().json))) return;

    try {
      const notice = await commandNotice(
        createAdapters(undefined, now),
        commandTime,
        fetch,
        false,
        process.cwd(),
      );

      reportCommandNotice(notice);
    } catch {
      // Notices must never prevent a command from running.
    }
  });

  addGroup(program, "Get started:", [setupCommand, joinCommand]);

  addGroup(program, "Daily use:", [
    statusCommand,
    pushCommand,
    pullCommand,
    diffCommand,
    resolveCommand,
    historyCommand,
  ]);

  addGroup(program, "Files:", [
    trackCommand,
    untrackCommand,
    localOnlyCommand,
    rmCommand,
    aliasCommand,
  ]);

  addGroup(program, "Devices and vault:", [
    deviceCommand,
    vaultCommand,
    serverCommand,
    unlockCommand,
  ]);

  addGroup(program, "Maintenance:", [
    configCommand,
    doctorCommand,
    updateCommand,
    uiCommand,
    agentCommand,
    shellCommand,
    serveCommand,
    versionCommand,
  ]);

  const parse = program.parseAsync.bind(program);

  program.parseAsync = async (...args) => {
    active = undefined;

    return commandCounts.run({}, async () => {
      return commandOutcome(
        () => parse(...args),
        async (outcome) => {
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        },
      );
    });
  };

  return program;
}
```


### apps/cli/src/program.ts:43 :: callback@43

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
write(sanitizeTerminal(message) + "\n")
```


### apps/cli/src/program.ts:47 :: callback@47

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
{
    const commandTime = now();

    const state = await loadState(createAdapters(undefined, now).home).catch(() => undefined);
    setUntrustedRoots(state?.approved.map((checkout) => checkout.root) ?? []);
    if (command.name() !== "status" || !command.opts().refreshCache) active = command;

    if (skipsNotices(command.name(), Boolean(command.opts().json))) return;

    try {
      const notice = await commandNotice(
        createAdapters(undefined, now),
        commandTime,
        fetch,
        false,
        process.cwd(),
      );

      reportCommandNotice(notice);
    } catch {
      // Notices must never prevent a command from running.
    }
  }
```


### apps/cli/src/program.ts:50 :: callback@50

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
undefined
```


### apps/cli/src/program.ts:51 :: callback@51

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
checkout.root
```


### apps/cli/src/program.ts:110 :: callback@110

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
{
    active = undefined;

    return commandCounts.run({}, async () => {
      return commandOutcome(
        () => parse(...args),
        async (outcome) => {
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        },
      );
    });
  }
```


### apps/cli/src/program.ts:113 :: callback@113

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
{
      return commandOutcome(
        () => parse(...args),
        async (outcome) => {
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        },
      );
    }
```


### apps/cli/src/program.ts:115 :: callback@115

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
parse(...args)
```


### apps/cli/src/program.ts:116 :: callback@116

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
{
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        }
```


### apps/cli/src/program.ts:131 :: addGroup

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
{
  program.commandsGroup(heading);
  for (const command of commands) program.addCommand(command);
}
```


### apps/cli/src/program.ts:136 :: reportCommandNotice

DONE: program command_tree uses frozen commands.json metadata; dispatch captures command clock then loads approvals ignoring load errors, sets untrusted roots, skips quiet/json notices, ignores notice errors, runs action, reports except status refreshCache, returns original result. Parser callbacks dispatch to explicit actions. Notice output order delegated to notice/command owner.

Ordered statements:

```ts
{
  for (const repo of notice.repos) console.error(`envden: ${repo} out of sync`);
  if (notice.update.available) console.error("envden: update available; run envden update");
  if (notice.update.required) console.error("envden: update required; run envden update");
}
```


### apps/cli/src/settings/paths.ts:4 :: paths

DONE: All derived locations use the adapter home after absolute lexical resolution. Existing adapters.rs relative-home regression and 43d28f95 cover resolution; store/state/base/conflicts/config names match source. Rust ensure_paths has a stricter symlink guard than TS ensurePaths, outside the pending paths helper.

Ordered statements:

```ts
{
  const root = resolve(home);

  return {
    home: root,
    store: join(root, "store"),
    state: join(root, "state"),
    base: join(root, "base"),
    conflicts: join(root, "conflicts"),
    config: join(root, "config.json"),
  };
}
```


### apps/cli/src/state/cancelled.ts:4 :: callback@4

DONE: output/prompts/terminal.rs cancelled constructs INVALID_INPUT with exact Cancelled message.

Ordered statements:

```ts
{
    super("INVALID_INPUT", "Cancelled");
  }
```


### apps/cli/src/state/configured.ts:6 :: requireConfigured

DONE: cf28e8fa: creationPending truthy guard precedes server/vaultId truthy NOT_FOUND guard. red-configured.log then green-configured.log. Rust has no callers supplying a custom message.

Ordered statements:

```ts
{
  if (state?.creationPending)
    throw new EnvdenError("CONFLICT", "Setup didn't finish. Run envden setup again to finish it");

  if (!state?.server || !state.vaultId) throw new EnvdenError("NOT_FOUND", message);

  return { ...state, server: state.server, vaultId: state.vaultId };
}
```


### apps/cli/src/state/store/files.ts:15 :: atomicWrite

DONE: 30d3961e. Rust creates parent privately when owned, wx 0600 temporary, restricts before write, writes/syncs/closes, renames, fsyncs Unix parent, finally removes temporary. Cleanup errors override earlier failure; red-cleanup.log then green-state.log.

Ordered statements:

```ts
{
  const parent = dirname(path);

  if ([...owned].some((root) => placeInRoot(root, parent) !== "outside"))
    await privateDirectory(parent);
  else await prepareDirectory(parent);

  const temporary = join(
    dirname(path),
    `.${String(now()).padStart(13, "0")}_${crypto.randomUUID()}.tmp`,
  );

  try {
    const file = await open(temporary, "wx", 0o600);

    try {
      await restrictAccess(temporary, false);
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);

    if (process.platform !== "win32") {
      const directory = await open(dirname(path), "r");

      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
}
```


### apps/cli/src/state/store/files.ts:22 :: callback@22

DONE: 30d3961e. Rust creates parent privately when owned, wx 0600 temporary, restricts before write, writes/syncs/closes, renames, fsyncs Unix parent, finally removes temporary. Cleanup errors override earlier failure; red-cleanup.log then green-state.log.

Ordered statements:

```ts
placeInRoot(root, parent) !== "outside"
```


### apps/cli/src/state/store/headers.ts:6 :: storeHeaders

DONE: 78685ca8. Rust hashes/stores immutable headers in source order, skips existing bytes, preserves duplicate refs; restoration validates lowercase SHA256 ref and content hash and now preserves exact Invalid header reference/Missing stored header cause. red-headers.log then green-state.log. TS restores concurrently; Rust synchronously, same output order.

Ordered statements:

```ts
{
  const refs: string[] = [];

  for (const header of headers) {
    const hash = createHash("sha256").update(header).digest("hex");
    const path = join(home, "state", "headers", hash);
    if ((await optionalRead(path)) === undefined) await atomicWrite(path, header, now);
    refs.push(hash);
  }

  return refs;
}
```


### apps/cli/src/state/store/headers.ts:19 :: restoreHeaders

DONE: 78685ca8. Rust hashes/stores immutable headers in source order, skips existing bytes, preserves duplicate refs; restoration validates lowercase SHA256 ref and content hash and now preserves exact Invalid header reference/Missing stored header cause. red-headers.log then green-state.log. TS restores concurrently; Rust synchronously, same output order.

Ordered statements:

```ts
{
  return Promise.all(
    refs.map(async (hash) => {
      if (!/^[a-f0-9]{64}$/.test(hash))
        throw new EnvdenError("INVALID_DATA", "Invalid header reference");

      const header = await optionalRead(join(home, "state", "headers", hash));

      if (header === undefined || createHash("sha256").update(header).digest("hex") !== hash)
        throw new EnvdenError("INVALID_DATA", "Missing stored header");

      return header;
    }),
  );
}
```


### apps/cli/src/state/store/headers.ts:21 :: callback@21

DONE: 78685ca8. Rust hashes/stores immutable headers in source order, skips existing bytes, preserves duplicate refs; restoration validates lowercase SHA256 ref and content hash and now preserves exact Invalid header reference/Missing stored header cause. red-headers.log then green-state.log. TS restores concurrently; Rust synchronously, same output order.

Ordered statements:

```ts
{
      if (!/^[a-f0-9]{64}$/.test(hash))
        throw new EnvdenError("INVALID_DATA", "Invalid header reference");

      const header = await optionalRead(join(home, "state", "headers", hash));

      if (header === undefined || createHash("sha256").update(header).digest("hex") !== hash)
        throw new EnvdenError("INVALID_DATA", "Missing stored header");

      return header;
    }
```


### apps/cli/src/state/store/real-location.ts:5 :: realLocation

DONE: adapters.rs real_location resolves absolute and lexical components, canonicalizes existing path, recursively resolves nearest ancestor, appends absent tail. Prior fix retained; compared to TS ordered steps.

Ordered statements:

```ts
{
  const absolute = resolve(path);

  try {
    return realpathSync(absolute);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
    const parent = dirname(absolute);

    return parent === absolute ? absolute : join(realLocation(parent), basename(absolute));
  }
}
```


### apps/cli/src/state/store/records.ts:45 :: invalidSyncRecord

DONE: Rust state/records.rs read_sync_record maps decode failure to INVALID_DATA, recover writes marker then renames then reports. invalidSyncRecord callers reproduce catch INVALID_DATA => true, success => false; filesystem failures propagate.

Ordered statements:

```ts
{
  try {
    await readSyncRecord(path, decode);

    return false;
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "INVALID_DATA") return true;
    throw error;
  }
}
```


### apps/cli/src/state/store/repository.ts:31 :: replacer

DONE: 40dc004f and 2189be9f. Rust preserves explicit tagged in-memory representation when saving and revives bottom-up before validation when loading: maps take precedence over sets, then bigint then bytes. Duplicate primitive map/set keys collapse; object keys retain separate identities; bigint text is validated/canonicalized; Buffer-compatible base64url bytes are normalized. red-collections.log and red-bigint.log fail before fixes; green-collections-all.log and green-bigint.log pass. Source step blocks remain below.

Ordered statements:

```ts
{
  if (value instanceof Map) return { $map: [...value] };
  if (value instanceof Set) return { $set: [...value] };
  if (typeof value === "bigint") return { $bigint: String(value) };
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString("base64url") };

  return value;
}
```


### apps/cli/src/state/store/repository.ts:40 :: reviver

DONE: 40dc004f and 2189be9f. Rust preserves explicit tagged in-memory representation when saving and revives bottom-up before validation when loading: maps take precedence over sets, then bigint then bytes. Duplicate primitive map/set keys collapse; object keys retain separate identities; bigint text is validated/canonicalized; Buffer-compatible base64url bytes are normalized. red-collections.log and red-bigint.log fail before fixes; green-collections-all.log and green-bigint.log pass. Source step blocks remain below.

Ordered statements:

```ts
{
  if (value && typeof value === "object") {
    const collection = reviveCollection(value);
    if (collection) return collection;
    if ("$bigint" in value && typeof value.$bigint === "string") return BigInt(value.$bigint);

    if ("$bytes" in value && typeof value.$bytes === "string")
      return new Uint8Array(Buffer.from(value.$bytes, "base64url"));
  }

  return value;
}
```


### apps/cli/src/state/store/repository.ts:53 :: saveState

DONE: save_state takes state lock, private home, ordered immutable header storage, removes headers/latest, inserts headerRefs, serializes preserved insertion order, atomic-writes device.json, clears placement. Header and atomic error regressions green. Tagged in-memory values retain their JSON marker representation.

Ordered statements:

```ts
{
  await withStateLock(home, async () => {
    await privateDirectory(home);
    const headerRefs = await storeHeaders(home, state.headers, now);
    const { headers: _headers, latest: _latest, ...record } = state;

    await atomicWrite(
      join(home, "state", "device.json"),
      JSON.stringify({ ...record, headerRefs }, replacer),
      now,
    );

    await clearPlacement(home);
  });
}
```


### apps/cli/src/state/store/repository.ts:58 :: callback@58

DONE: Lock callback follows same save sequence described for saveState; source step block retained below. State files/headers regressions verify side effects and latest omission.

Ordered statements:

```ts
{
    await privateDirectory(home);
    const headerRefs = await storeHeaders(home, state.headers, now);
    const { headers: _headers, latest: _latest, ...record } = state;

    await atomicWrite(
      join(home, "state", "device.json"),
      JSON.stringify({ ...record, headerRefs }, replacer),
      now,
    );

    await clearPlacement(home);
  }
```


### apps/cli/src/state/store/repository.ts:73 :: loadState

DONE: 40dc004f restores tagged collections bottom-up before shape validation; 78685ca8 preserves header causes; 3eeab84f accepts numeric format 1.0 as TS does. Then remove headerRefs, restore immutable headers, restore truthy update-cache latest, restore placement, return; all failures inside restoration wrap as INVALID_DATA Unreadable local state. Initial optional read errors remain outside catch as in TS. red-format-number.log then green-format-number.log; state regressions green.

Ordered statements:

```ts
{
  const text = await optionalRead(join(home, "state", "device.json"));
  if (text === undefined) return undefined;

  try {
    const value: Omit<ILocalState, "headers"> & { headerRefs: string[] } = JSON.parse(
      text,
      reviver,
    );

    if (
      value.format !== 1 ||
      !Array.isArray(value.headerRefs) ||
      !Array.isArray(value.entries) ||
      !Array.isArray(value.approved) ||
      !Array.isArray(value.links) ||
      typeof value.deviceName !== "string" ||
      !value.aliases ||
      typeof value.aliases !== "object" ||
      Array.isArray(value.aliases) ||
      typeof value.telemetry !== "boolean" ||
      typeof value.updateCheck !== "boolean" ||
      Object.keys(value).some((key) => !stateKeys.has(key))
    )
      throw new Error("Invalid state");

    const { headerRefs, ...record } = value;
    const state: ILocalState = { ...record, headers: await restoreHeaders(home, headerRefs) };
    const latest = (await readUpdateCache(home)).latest;
    if (latest) state.latest = latest;
    await restorePlacement(home, state);

    return state;
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Unreadable local state", { cause });
  }
}
```


### apps/cli/src/state/store/repository.ts:95 :: callback@95

DONE: Allowed-key callback tests the identical KEYS list including optional verifiedState/aliasAsked/creationPending/session and excludes headers/latest from the persistent record. Record iteration is insertion ordered.

Ordered statements:

```ts
!stateKeys.has(key)
```


### apps/cli/src/state/store/repository.ts:111 :: reviveCollection

DONE: 40dc004f and 2189be9f. Rust preserves explicit tagged in-memory representation when saving and revives bottom-up before validation when loading: maps take precedence over sets, then bigint then bytes. Duplicate primitive map/set keys collapse; object keys retain separate identities; bigint text is validated/canonicalized; Buffer-compatible base64url bytes are normalized. red-collections.log and red-bigint.log fail before fixes; green-collections-all.log and green-bigint.log pass. Source step blocks remain below.

Ordered statements:

```ts
{
  if ("$map" in value && Array.isArray(value.$map)) return new Map(value.$map);
  if ("$set" in value && Array.isArray(value.$set)) return new Set(value.$set);

  return undefined;
}
```


### apps/cli/src/ui/server/assets.ts:15 :: pageAssets

DONE: Rust embeds the exact build outputs; fresh Bun.build on frozen HTML entry compared all three output bodies byte-for-byte: /tmp/sweep-final/assets.log, HTML 2086 bytes, JS 69114, CSS 9867. Route/type mapping in ui/server/assets.rs matches compiled TS assets. Source-runtime build callbacks have no Rust runtime counterpart.

Ordered statements:

```ts
{
  const files = bundle.files ? compiledFiles(bundle.files) : await sourceFiles(bundle.index);
  const assets = new Map<string, IPageAsset>();

  for (const file of files) {
    const route = file.type.startsWith("text/html") ? "/" : `/${basename(file.path)}`;

    assets.set(route, { body: await file.bytes(), type: file.type });
  }

  return assets;
}
```


### apps/cli/src/ui/server/assets.ts:29 :: compiledFiles

DONE: Rust embeds the exact build outputs; fresh Bun.build on frozen HTML entry compared all three output bodies byte-for-byte: /tmp/sweep-final/assets.log, HTML 2086 bytes, JS 69114, CSS 9867. Route/type mapping in ui/server/assets.rs matches compiled TS assets. Source-runtime build callbacks have no Rust runtime counterpart.

Ordered statements:

```ts
{
  return files.map((file) => ({
    path: file.path,
    type: file.headers["content-type"],
    bytes: () => Bun.file(file.path).arrayBuffer(),
  }));
}
```


### apps/cli/src/ui/server/assets.ts:30 :: callback@30

DONE: Rust embeds the exact build outputs; fresh Bun.build on frozen HTML entry compared all three output bodies byte-for-byte: /tmp/sweep-final/assets.log, HTML 2086 bytes, JS 69114, CSS 9867. Route/type mapping in ui/server/assets.rs matches compiled TS assets. Source-runtime build callbacks have no Rust runtime counterpart.

Ordered statements:

```ts
({
    path: file.path,
    type: file.headers["content-type"],
    bytes: () => Bun.file(file.path).arrayBuffer(),
  })
```


### apps/cli/src/ui/server/assets.ts:33 :: callback@33

DONE: Rust embeds the exact build outputs; fresh Bun.build on frozen HTML entry compared all three output bodies byte-for-byte: /tmp/sweep-final/assets.log, HTML 2086 bytes, JS 69114, CSS 9867. Route/type mapping in ui/server/assets.rs matches compiled TS assets. Source-runtime build callbacks have no Rust runtime counterpart.

Ordered statements:

```ts
Bun.file(file.path).arrayBuffer()
```


### apps/cli/src/ui/server/assets.ts:37 :: sourceFiles

DONE: Rust embeds the exact build outputs; fresh Bun.build on frozen HTML entry compared all three output bodies byte-for-byte: /tmp/sweep-final/assets.log, HTML 2086 bytes, JS 69114, CSS 9867. Route/type mapping in ui/server/assets.rs matches compiled TS assets. Source-runtime build callbacks have no Rust runtime counterpart.

Ordered statements:

```ts
{
  const result = await Bun.build({ entrypoints: [index] });

  return result.outputs.map((output) => ({
    path: output.path,
    type: output.type,
    bytes: () => output.arrayBuffer(),
  }));
}
```


### apps/cli/src/ui/server/assets.ts:40 :: callback@40

DONE: Rust embeds the exact build outputs; fresh Bun.build on frozen HTML entry compared all three output bodies byte-for-byte: /tmp/sweep-final/assets.log, HTML 2086 bytes, JS 69114, CSS 9867. Route/type mapping in ui/server/assets.rs matches compiled TS assets. Source-runtime build callbacks have no Rust runtime counterpart.

Ordered statements:

```ts
({
    path: output.path,
    type: output.type,
    bytes: () => output.arrayBuffer(),
  })
```


### apps/cli/src/ui/server/assets.ts:43 :: callback@43

DONE: Rust embeds the exact build outputs; fresh Bun.build on frozen HTML entry compared all three output bodies byte-for-byte: /tmp/sweep-final/assets.log, HTML 2086 bytes, JS 69114, CSS 9867. Route/type mapping in ui/server/assets.rs matches compiled TS assets. Source-runtime build callbacks have no Rust runtime counterpart.

Ordered statements:

```ts
output.arrayBuffer()
```


### apps/cli/src/ui/server/errors.ts:21 :: errorBody

DONE: Rust ui/server/app.rs returns error then message with mapped status for EnvdenError. Internal non-domain errors use fixed text at conversion boundaries; arbitrary JS thrown values have no Rust equivalent.

Ordered statements:

```ts
{
  if (error instanceof EnvdenError) return { error: error.code, message: error.message };

  return { error: "INTERNAL", message: "envden ui hit an internal error" };
}
```


### apps/cli/src/ui/start.ts:17 :: runDashboard

DONE: 79a78360 restores forced shutdown. Validates terminal then port, creates token/listener/app, prints URL and stop line, attempts browser, waits for interrupt/terminate and drops server runtime including pending requests. red-shutdown.log failed with a real pending HTTP handler; green-shutdown.log passes without sleeps or timeouts.

Ordered statements:

```ts
{
  if (!options.interactive)
    throw new EnvdenError("INVALID_INPUT", "envden ui needs an interactive terminal");

  if (options.port !== undefined && !validPort(options.port))
    throw new EnvdenError("INVALID_INPUT", "Port must be 1-65535");

  const token = newToken();
  const assets = await pageAssets(page);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    fetch: (request) => app.fetch(request),
  });

  const port = server.port ?? options.port ?? 0;
  const app = createDashboardApp({ adapters, now: options.now, token, port, assets });
  const url = `http://127.0.0.1:${port}/#${token}`;

  try {
    options.report(`envden ui: ${url}`);
    options.report("Press Ctrl-C to stop.");

    if (options.open && !(await options.open(url)))
      options.report("Could not open a browser; open the link above.");

    await options.stopped;
  } finally {
    await server.stop(true);
  }

  return { kind: "stopped" as const };
}
```


### apps/cli/src/ui/start.ts:30 :: callback@30

DONE: 79a78360 restores forced shutdown. Validates terminal then port, creates token/listener/app, prints URL and stop line, attempts browser, waits for interrupt/terminate and drops server runtime including pending requests. red-shutdown.log failed with a real pending HTTP handler; green-shutdown.log passes without sleeps or timeouts.

Ordered statements:

```ts
app.fetch(request)
```


### apps/cli/src/ui/view/conflicts.ts:7 :: conflictViews

DONE: Rust ui/view/status.rs conflict_views reads records, mine unless deleted, server unless deleted, diff(server,mine), then emits id/path/roots/keys/serverDeleted/mineDeleted in source key order. Empty key is unreachable: TS merge/parser.ts key regex requires nonempty ASCII identifier; duplicate/value failures cannot carry empty key.

Ordered statements:

```ts
{
  const views: IConflictView[] = [];

  for (const record of await conflictRecords(home)) {
    const mine = record.mineDeleted ? undefined : await readBytes(record.mine);
    const server = record.deleted ? undefined : await readBytes(record.server);

    views.push({
      id: record.file,
      path: record.path,
      roots: record.targets.map((target) => target.root),
      keys: keyChanges(diffEnvKeys(server ?? new Uint8Array(), mine ?? new Uint8Array())),
      serverDeleted: record.deleted,
      mineDeleted: record.mineDeleted,
    });
  }

  return views;
}
```


### apps/cli/src/ui/view/conflicts.ts:17 :: callback@17

DONE: Rust ui/view/status.rs conflict_views reads records, mine unless deleted, server unless deleted, diff(server,mine), then emits id/path/roots/keys/serverDeleted/mineDeleted in source key order. Empty key is unreachable: TS merge/parser.ts key regex requires nonempty ASCII identifier; duplicate/value failures cannot carry empty key.

Ordered statements:

```ts
target.root
```


### apps/cli/src/ui/view/repos.ts:11 :: groupRepos

DONE: a65426ee. Rust preserves first repo/checkout insertion order, appends file then upgrades urgency, sorts repo IDs through ICU collation. Bun oracle fixture covers punctuation, case, diacritics and digit strings; red-locale.log then green-locale.log. Bun retained en-US under Swedish and Turkish LANG/LC_ALL child environments; the locale fixture matches that observed reference.

Ordered statements:

```ts
{
  const repos = new Map<string, IRepoView>();

  for (const row of rows) {
    const repo = repos.get(row.repoId) ?? {
      repoId: row.repoId,
      status: row.file.status,
      checkouts: [],
    };

    repos.set(row.repoId, repo);

    let checkout = repo.checkouts.find((item) => item.root === row.root);

    if (!checkout) {
      checkout = { root: row.root, approval: row.approval, files: [] };
      repo.checkouts.push(checkout);
    }

    checkout.files.push(row.file);
    repo.status = mostUrgent([repo.status, row.file.status]);
  }

  return [...repos.values()].sort((a, b) => a.repoId.localeCompare(b.repoId));
}
```


### apps/cli/src/ui/view/repos.ts:23 :: callback@23

DONE: a65426ee. Rust preserves first repo/checkout insertion order, appends file then upgrades urgency, sorts repo IDs through ICU collation. Bun oracle fixture covers punctuation, case, diacritics and digit strings; red-locale.log then green-locale.log. Bun retained en-US under Swedish and Turkish LANG/LC_ALL child environments; the locale fixture matches that observed reference.

Ordered statements:

```ts
item.root === row.root
```


### apps/cli/src/ui/view/repos.ts:34 :: callback@34

DONE: a65426ee. Rust preserves first repo/checkout insertion order, appends file then upgrades urgency, sorts repo IDs through ICU collation. Bun oracle fixture covers punctuation, case, diacritics and digit strings; red-locale.log then green-locale.log. Bun retained en-US under Swedish and Turkish LANG/LC_ALL child environments; the locale fixture matches that observed reference.

Ordered statements:

```ts
a.repoId.localeCompare(b.repoId)
```


### apps/cli/src/ui/view/status.ts:28 :: dashboardStatus

DONE: 6caf2627 restores nonempty initial vault ID and local-status vaultId guard before held/remote/approval/conflict/probe reads. Ordered steps retained below. red-dashboard.log then green-dashboard.log.

Ordered statements:

```ts
{
  const before = await loadState(adapters.home);
  if (!before?.server || !before.vaultId) return { kind: "not-configured" };

  const diffs = await diff(adapters, { now, fetcher: adapters.fetcher, all: true });
  const local = await localStatus(adapters);
  const state = await loadState(adapters.home);

  if (!("vaultId" in local) || !state?.server || !state.vaultId) return { kind: "not-configured" };

  const heldBack = await heldBackFiles(adapters);
  const remote = new Set((await readRemoteNotice(adapters.home))?.repos ?? []);
  const approvals = await checkoutApprovals(adapters, state);
  const conflicts = await conflictViews(adapters.home);
  const probe = await probeUnlock(adapters, now);
  const checkedAt = now();

  const facts = { diffs, heldBack, conflicts, remote };

  const rows = local.links.map((link) => {
    const repoId = checkoutRepo(state, link.root);

    return {
      repoId: repoId ?? "unapproved",
      root: link.root,
      approval: approvals.get(link.root) ?? "needs-approval",
      file: fileView(link, repoId, facts),
    };
  });

  return {
    kind: "configured",
    overview: {
      vaultId: state.vaultId.slice(0, 8),
      server: { address: state.server.address, reachability: local.server },
      deviceName: state.deviceName,
      unlock: deriveUnlock(state.session?.unlockedUntil, probe, checkedAt),
      checkedAt,
      pending: pendingCount(rows.map((row) => row.file.status)),
    },
    repos: groupRepos(rows),
    conflicts,
  };
}
```


### apps/cli/src/ui/view/status.ts:50 :: callback@50

DONE: Rows iterate local.links in order, derive aliased repo and approval default, then file facts/status/conditional held/conflictId/keys; checkedAt captured once after probe and before rows.

Ordered statements:

```ts
{
    const repoId = checkoutRepo(state, link.root);

    return {
      repoId: repoId ?? "unapproved",
      root: link.root,
      approval: approvals.get(link.root) ?? "needs-approval",
      file: fileView(link, repoId, facts),
    };
  }
```


### apps/cli/src/ui/view/status.ts:69 :: callback@69

DONE: Row callback extracts file.status in source order for pending_count.

Ordered statements:

```ts
row.file.status
```


## Completion

Initial PENDING: 106. Final PENDING: 0.

Protected-owner gaps are recorded as compared and reported, not silently fixed in their files. Final validation logs use the verified- prefix.
