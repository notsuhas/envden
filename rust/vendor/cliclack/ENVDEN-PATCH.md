# CliClack 0.5.7 input compatibility

Source: https://crates.io/crates/cliclack/0.5.7 (MIT).

The crate still owns terminal input, rendering, password masking and progress.
The local changes preserve existing keyboard decisions:

- `Input::initial_input` sets editable text, rather than a placeholder default.
- Space toggles confirms; list navigation wraps; `a` toggles all checkboxes.
- Multiselect retains selection order, `i` inverts, and full-width space toggles.
- Text and password inputs retain Ctrl-B/F/K/U/W editing.
- Empty optional multiselects wait for Enter or cancellation; empty filtered
  lists ignore navigation rather than wrapping modulo zero.
- Terminal eligibility and key reading follow stdin, including redirected output.
- Progress uses stdout to match the CLI's stdout terminal gate.

The CLI holds raw mode across each prompt, before its label appears, to prevent
fast input from echoing passwords between per-key reads. Output processing stays
enabled so the crate can render ordinary newlines.

`rust/cli/tests/prompts.rs` drives these behaviours through a PTY. Remove the
patch when upstream exposes equivalent controls, retaining the behaviour tests.
