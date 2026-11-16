# codex-swaps review

Reviewed HEAD `e5c45390bb11b1dc256b55f0a412b9a500c51b81`, scoped to `03aa4c5..HEAD -- go/`, using the functional parity rule. No repository edits.

## Medium: accepted dash operands are rejected before the command runs

Category: argument acceptance, exit/error codes, lifecycle effects.

Go: `go/cli/program/command/normalize.go:41` and `:100`.
TS: `apps/cli/src/commands/maintenance/config.ts:12-22`, `apps/cli/src/commands/sync/history.ts:16-35`; parser behavior in `node_modules/.bun/commander@15.1.0/node_modules/commander/lib/command.js:1764-1777,1882-1890`.

The normalizer treats every token starting with `-` as an option. Commander treats a lone `-` as an operand, and accepts negative numbers as operands in leaf commands and as further variadic option values. This rejects inputs TS accepts, changes error codes, and prevents the preAction/action effects.

Reproduced with both binaries in fresh, non-TTY temp homes:

- `config -` and `config -1`: TS reaches setting validation and exits **2**, reporting the unknown setting and valid settings; Go reports an unknown option and exits **1**.
- `history -` and `history -1`: TS reaches the action, reports that setup is needed, and writes `state/updates.json`, `state/recovery-notice`, and `state/pending-recovery.json` below ENVDEN_HOME; Go rejects the operand and writes none of these files.
- `server move -`: TS exits **2**, requesting a setup token; Go exits **1**, rejecting `-`.
- `rm -1`: TS reaches file validation and reports an untracked file; Go rejects the operand at parse time.

Fix direction: preserve Commander's distinction between options and dash/negative-number operands, including variadic values. Ensure Cobra/pflag also receives those operands without reparsing them as flags.

Evidence: `/tmp/codex-swaps/target.jsonl`, `numbers.jsonl`; rerun scripts `target.py`, `numbers.py`, and `check.py` in the same folder.

## Medium: horizontal menu navigation maps the same answer to different file writes

Category: prompts, selected answers, files written.

Go: `go/cli/output/prompts/session.go:50-56,120-124`.
TS: `apps/cli/src/output/prompts/questions.ts:56-72`, invoked by `apps/cli/src/commands/shell/shell.ts:19-24`; Clack cursor mapping at `node_modules/.bun/@clack+core@1.6.0/node_modules/@clack/core/dist/index.mjs:947-960`.

The Huh select keymap leaves Left/Right and h/l disabled for vertical lists. Clack treats Left/Right as previous/next, just like Up/Down. The wrapper only adjusts confirm keys, so ordinary menu navigation silently selects the wrong value. This is a functional difference, not prompt styling.

Reproduced twice per sequence in a 200-column PTY, with isolated homes, running `shell install` without an explicit shell:

- At the initial zsh choice, send **Right, Enter** (`\x1b[C\r`). TS chooses bash and writes `.bash_profile`; Go chooses zsh and writes `.zshrc`. Both exit 0.
- Send **Left, Enter** (`\x1b[D\r`). TS wraps to "No, skip it" and writes no shell profile; Go chooses zsh and writes `.zshrc`. Both exit 0.

The shared select wrapper also serves resolution and onboarding choices, so this is not limited to shell configuration.

Fix direction: configure Huh's select navigation to retain Clack's cursor mapping. Check multiselect navigation too. Keep the native rendering.

Evidence: `/tmp/codex-swaps/retest.jsonl`, `keys.jsonl`; reproduction helper `/tmp/codex-swaps/terminal_check.py` and `/tmp/codex-swaps/retest.py`.

## Low: Ctrl+D introduces a cancellation path absent from TS

Category: prompts, cancellation outcomes and exit codes.

Go: `go/cli/output/prompts/session.go:51`.
TS: `apps/cli/src/output/prompts/questions.ts:62-72`; Clack action aliases and key processing in `node_modules/.bun/@clack+core@1.6.0/node_modules/@clack/core/dist/index.mjs:60-72,299-301`.

The replacement explicitly adds `ctrl+d` to Quit. TS's select prompt does not cancel on Ctrl+D. Go consequently aborts a command that TS keeps accepting answers for.

In the same isolated `shell install` PTY, Ctrl+D alone leaves TS awaiting an answer, while Go reports `Cancelled` and exits **2**. The TS test process was killed by the test helper after five seconds; that kill is a test timeout, not the CLI's exit code. Escape and Ctrl+C both exit 2 in both implementations.

Fix direction: retain TS's cancellation keys rather than adding a new cancellation decision.

A second reproduction sent Ctrl+D, Down, Enter (`\x04\x1b[B\r`): TS selected bash, wrote `.bash_profile` and exited 0; Go cancelled and exited 2. This passed twice.

Evidence: `/tmp/codex-swaps/cancel.jsonl`, `keys.jsonl`, `retest.jsonl`; `/tmp/codex-swaps/cancel_check.py`.

## Verification and limits

- Built Go using the supplied command. Ran the supplied compiled TS CLI and the newly built Go CLI with temporary HOME, ENVDEN_HOME, XDG_CONFIG_HOME and TMPDIR throughout.
- Completed 400 seeded argument-combination comparisons, plus targeted cases. Exercised help at root/group/leaf levels, version flags and precedence, unknown flags, boolean attached values, `--`, ordering, repeated choices, conflicts, required arguments, hidden status flags and dash operands. Wording/layout differences were not findings.
- Real-binary PTY checks covered default shell selection, arrow/vim navigation, Escape and Ctrl+C cancellation, and the differing keys above.
- Existing Go tests passed for `./cli/time`, `./cli/vault/recovery/pdf`, `./cli/output/prompts`, and `./cli/program/...`.
- Generated PDFs through both implementations' source APIs in scratch directories. Extracted text matches exactly; both use `envden Recovery Kit AAAAAA.pdf`, mode 0600, the same title/creator/producer and one A4 page. Metadata dates differ in this experiment because the helper supplied a fixed metadata time only to Go. Existing PDF tests compare fixed-time object fields and decompressed content against the TS reference and passed. No zlib/PDF regression found.
- Date/size changes were inspected for decision/persistence use. No additional substantiated finding from those swaps. No full network onboarding, configured-vault resolution flow or server DB parity run was performed in this scoped review.
