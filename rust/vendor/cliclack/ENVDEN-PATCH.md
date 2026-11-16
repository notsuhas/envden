# CliClack 0.5.7 input compatibility

Source: https://crates.io/crates/cliclack/0.5.7 (MIT).

The crate still owns rendering, password masking and progress. Key input now
follows what `@clack/prompts` 1.9.0 does under Bun, where Clack hands text
editing to Node's readline:

- `prompt/keypress.rs` decodes input like readline's `emitKeys`, including
  modifier parameters, SS3 keys and the 50 ms escape timeout.
- `prompt/readline.rs` edits the line like readline's `_ttyWrite`: Ctrl-U and
  Ctrl-K delete one side of the cursor into a kill ring, Ctrl-Y and Alt-Y yank,
  Ctrl-_ and Ctrl-^ undo and redo, Up, Down, Ctrl-P and Ctrl-N walk the lines
  submitted in this prompt, and word keys use readline's word boundaries.
  Passwords use the same editing; Bun 1.4.0 and 1.4.4 both treat Ctrl-W and the
  word keys there as edits, not literal input.
- Ctrl-D deletes the character under the cursor. On an empty line it closes
  readline: Clack still sees the rest of that terminal read, then ignores input
  until Ctrl-C, which cancels here and sends SIGINT under Bun.
- After a rejected Enter the answer is written back with the cursor at its end,
  as Clack's `rl.write` does. Ctrl-J clears the line without submitting.
- Selects, multiselects and confirms get Clack's aliases: `h/j/k/l` with any
  modifier (so Ctrl-K and Ctrl-L move), arrows with any modifier, Ctrl-J toggles
  a confirm, and `a` or `i` with any modifier toggle or invert checkboxes.
  Ctrl-P and Ctrl-N do nothing there.

Earlier local changes are kept:

- `Input::initial_input` sets editable text, rather than a placeholder default.
- Space toggles confirms; list navigation wraps.
- Multiselect retains selection order and full-width space toggles.
- Empty optional multiselects wait for Enter or cancellation; empty filtered
  lists ignore navigation rather than wrapping modulo zero.
- Redraws preserve unchanged prompt headers so automation sees each question once.
- Terminal eligibility follows stdin, and keys are read from stdin rather than
  the render stream: raw bytes on Unix, console key events via crossterm on
  Windows, translated to the VT sequences libuv would produce there.
- Progress uses stdout to match the CLI's stdout terminal gate.

The CLI holds raw mode across each prompt, before its label appears, to prevent
fast input from echoing passwords between reads. Output processing stays
enabled so the crate can render ordinary newlines.

Known gaps: Ctrl-Z does not suspend the process, and the Windows translation
has not been checked against Bun on Windows.

`rust/cli/tests/prompts.rs` drives these behaviours through a PTY, with
expected values taken from Bun. Remove the patch when upstream exposes
equivalent controls, retaining the behaviour tests.
