# Links / CLI / UI fixes

- fc84eac4 telemetry child environment: do not pass lowercase envden_home.
- f055867a config reads: UTF8 replacement before JSON validation.
- f6fdc153 update: capture command clock before all branches.
- 2ea3c6d8 dashboard: guards before body reads.
- 35e809ac push: explicit conflict kind triggers CONFLICT even with count zero.
- 32d9562f dashboard key changes: omit empty key.
- 49ff2bc6 program: scope telemetry counts around action and reporting.
- a2317756 history: parse versions before dispatch using TS grammar and JS rounding.
- 6e1bce04 prune: use parent lstat identity without following symlinks.
- ca0c956c bases: remove corrupt marker before deleting unshared bases.
- 8036714c discovery: never traverse non-checkout submodule directories.
- 909c48e / 3d9ad2f6 dashboard: restore read order and deduplicate approval reads.
- 4e43f9f2 status: canonicalize displayed home.
- c941813f links: normalize unresolved targets and deleted-copy home display.
- 88ab94a0 store choice: a disappearing file is absent rather than a fatal read failure.
- f72ab1f5 checkout placement: default-no prompts, reuse config, JS compose regex semantics.
- 4f64db6a discovery: add/progress before related-checkout listing.
- 1a2da199 dashboard: consume bodies only on JSON-input routes.
- 432613d1 was superseded by 8c82ea85 / 1253d965: pin and preserve the compiled TS nested-error bytes; document terminal-injection bug.
- 528b8751 UI port parser accepts JS Number radix prefixes.

Auxiliary: 4c142660 scopes Unix-only checkout test imports; carries formatting of the exploratory fork test captured by the shared-index race.

Review 2ea3c6d8, c901783 and 909c48e with the shared-index race notes in checklist.md. Do not rewrite shared history. c941813f and 88ab94a0 must be reviewed together because extraction call sites and helper were split across those commits.

- 60817997 platform home resolution; 5eff8865 relative state-home resolution.
- 5df5c089 Windows unused-mut cleanup.
- 5b4a76db state UTF8/access restrictions; 23737d48 update-cache latest restoration.
