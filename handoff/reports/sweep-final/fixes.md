# Final sweep fixes

- 43d28f95: normalize home paths before abbreviation; red-home.log, green-home.log.
- cf28e8fa: use JS truthiness for configured state; red-configured.log, green-configured.log.
- 30d3961e: propagate atomic cleanup failures; red-cleanup.log, green-state.log.
- 78685ca8: preserve header restore causes; red-headers.log, green-state.log.
- 74f0d272: render resolution placement reports; red-resolved.log, green-resolved.log.
- a65426ee: locale sorting for repos and takeover links; red-locale.log, green-locale.log.
- 40dc004f: revive tagged state collections; red-collections.log, green-collections-all.log.
- da338e7d: match replacement-kit path/hostname fallbacks; red-kit.log, green-kit.log.
- 2189be9f: reject separators in bigint text; red-bigint.log, green-bigint.log.
- 6caf2627: restore dashboard local-vault guard; red-dashboard.log, green-dashboard.log.
- 79a78360: force dashboard stop with pending requests; red-shutdown.log, green-shutdown.log.
- 23da1009: sanitize shared library console sinks; red-sinks.log, green-sinks.log.
- 3eeab84f: accept JSON format 1.0; red-format-number.log, green-format-number.log.
- 139c7096: remove Windows unused import; Windows cross-check compiler evidence.
- 38ae2d9d: collect submodules before scan-root descent; red-discovery-order.log, green-discovery.log.

# Protected-owner gaps

- rust/cli/src/onboarding/scan.rs vault_repos derives checkpoint_material rather than TS syncContext, skipping its request/session/chain-refresh steps.
- rust/cli/src/onboarding/setup.rs device_name invokes a hostname subprocess instead of using the adapter hostname supplied by TS.
- rust/cli/src/onboarding/join.rs uses checkpoint.is_string for rejoin rather than TS truthiness; an empty checkpoint string routes differently. The command wrapper shares that issue.
- rust/cli/src/sync/command.rs merge confirmation defaults true; frozen TS consent defaults false.
- rust/cli/src/sync/local/conflicts/render.rs saved_source parses +1 as a variant index; TS accepts only a digit suffix. A final newline also differs from the JS regex dollar-anchor behavior.

No protected-owner files or frozen TypeScript files were edited by this sweep. No newly identified TS bug required a PARITY-NOTES.md entry.

# Inventory

106 PENDING before; 0 PENDING after. Every source block retains its ordered TS statements and comparison evidence in checklist.md. Protected gaps are compared and reported rather than marked as fixed.

# Validation

Final run logs are verified-fmt.log, verified-clippy.log, verified-workspace.log, verified-windows.log, verified-release.log, verified-parity.log and verified-e2e.log. Suite outcomes are recorded after completion in results.md.
