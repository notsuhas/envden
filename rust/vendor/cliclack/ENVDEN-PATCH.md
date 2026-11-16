# CliClack 0.5.7 patch

Source: https://crates.io/crates/cliclack/0.5.7 (MIT).

The crate owns rendering, key bindings, line editing, password masking and
progress. Key handling is CliClack's own; envden patches only what changes a
prompt's outcome:

- `Input::initial_input` sets an editable initial value, so Enter submits the
  same default the reference prompt shows.
- Multiselect returns values in the order they were selected, starting from
  the initial selection.
- An optional multiselect with no items still waits for Enter or cancellation
  instead of failing.
- Select and multiselect ignore keys while a filtered list is empty, instead of
  indexing an empty list.
- Prompts gate on stdin being a terminal and read keys from stdin on Unix, so
  redirected stdout or stderr doesn't block or refuse a prompt. On Windows keys
  come from the console input through whichever of stderr or stdout is a
  console; with neither, the prompt fails as non-interactive instead of
  spinning.
- Redraws leave unchanged leading lines alone, so a prompt's question is
  written once.
- Progress draws on stdout, matching the CLI's stdout terminal gate.

`rust/cli/tests/prompts.rs` drives these through a PTY. Remove the patch when
upstream exposes equivalent controls, keeping the behaviour tests.
