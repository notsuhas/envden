# audit-storage

78/78 TS cases mapped: SQLite 47/47, testing 31/31.
Compared the frozen TS assertion bodies with Rust, including bytes, error checks, injected time and stored state.
No Rust behavior bug found. Test-only hooks exercise shared permission-helper calls and actual interrupted blob writes.
Windows ACL case is compiled under cfg(windows); runtime ACL execution requires Windows.
No TS reference files changed. Shared audit inputs remain untouched.

| TS source | Case | Rust assertion | Status |
|---|---|---|---|
| packages/testing/__tests__/memory-storage.test.ts | creation, token consumption and digest retries | rust/testing/src/storage/contract/chain::creation; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | uncommitted blobs expire and obey quota | rust/testing/src/storage/contract/blobs::blob_staging_contract; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | discard removes inactive imports and refuses active vaults | rust/testing/src/storage/contract/chain::discard; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | chain, credentials and devices survive reopening | rust/testing/src/storage/contract/chain::persistence; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | failed commits roll back all state | rust/testing/src/storage/contract/chain::rollback; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | move and repair state survive reopening | rust/testing/src/storage/contract/repair::repair; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | login states expire and are consumed once | rust/testing/src/storage/contract/access::sessions; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | join tickets expire and commit consumes them | rust/testing/src/storage/contract/access::tickets; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | nonces expire after ten minutes | rust/testing/src/storage/contract/access::nonces; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | rate limits isolate, refund and double | rust/testing/src/storage/contract/access::rates; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | mailbox numbers and write-once slots | rust/testing/src/storage/contract/mailboxes::slots; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | ten mailboxes per vault per rolling hour | rust/testing/src/storage/contract/mailboxes::openings; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | pair commit closes mailbox; approver lasts 24h | rust/testing/src/storage/contract/mailboxes::pairing; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | blob hashes, vault isolation and conflicts | rust/testing/src/storage/contract/blobs::blobs; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | history retains versions and repair material | rust/testing/src/storage/contract/blobs::history; runner: rust/testing/tests/memory.rs | fully mapped |
| packages/testing/__tests__/memory-storage.test.ts | memory storage rejects unspecified calls and rolls back transactions | rust/testing/tests/memory.rs::memory_adapters_require_explicit_operations_and_roll_back | fully mapped |
| packages/testing/__tests__/fakes.test.ts | missing and repeated deletion are harmless | rust/testing/src/keychain/contract.rs via tests/memory.rs | fully mapped |
| packages/testing/__tests__/fakes.test.ts | binary values, replacement, empty values and names stay isolated | rust/testing/src/keychain/contract.rs via tests/memory.rs | fully mapped |
| packages/testing/__tests__/fakes.test.ts | keychain fake rejects every unspecified operation | rust/testing/tests/fakes/keychain.rs; exact panic text per operation | fully mapped |
| packages/testing/__tests__/fakes.test.ts | placement fake rejects every unspecified operation | rust/testing/tests/fakes/placement.rs; exact panic text per operation | fully mapped |
| packages/testing/__tests__/fakes.test.ts | repo fake rejects every unspecified operation | rust/testing/tests/fakes/repo.rs; exact panic text per operation | fully mapped |
| packages/testing/__tests__/fakes.test.ts | network fake rejects every unspecified operation | rust/testing/tests/fakes/network.rs; exact panic text per operation | fully mapped |
| packages/testing/__tests__/fakes.test.ts | shell fake rejects every unspecified operation | rust/testing/tests/fakes/shell.rs; exact panic text per operation | fully mapped |
| packages/testing/__tests__/fakes.test.ts | storage fake rejects every unspecified operation | rust/testing/tests/fakes/storage.rs; exact panic text per operation | fully mapped |
| packages/testing/__tests__/fakes.test.ts | memory keychain requires explicit operations and returns independent bytes | rust/testing/tests/memory.rs::memory_adapters_require_explicit_operations_and_roll_back | fully mapped |
| packages/testing/__tests__/adapters.test.ts | shell/rc has a contract suite | rust/testing/tests/adapters.rs::adapter_crates_have_contract_suites | fully mapped |
| packages/testing/__tests__/adapters.test.ts | network/tailscale has a contract suite | rust/testing/tests/adapters.rs::adapter_crates_have_contract_suites | fully mapped |
| packages/testing/__tests__/adapters.test.ts | storage/sqlite has a contract suite | rust/testing/tests/adapters.rs::adapter_crates_have_contract_suites | fully mapped |
| packages/testing/__tests__/adapters.test.ts | keychain/file has a contract suite | rust/testing/tests/adapters.rs::adapter_crates_have_contract_suites | fully mapped |
| packages/testing/__tests__/adapters.test.ts | repo/git has a contract suite | rust/testing/tests/adapters.rs::adapter_crates_have_contract_suites | fully mapped |
| packages/testing/__tests__/adapters.test.ts | placement/fs has a contract suite | rust/testing/tests/adapters.rs::adapter_crates_have_contract_suites | fully mapped |
| packages/adapters/storage/sqlite/src/chain/__tests__/history.test.ts | unchanged file versions do not pin every historical list | rust/adapters/storage/sqlite/tests/history.rs::unchanged_versions_do_not_pin_every_list | fully mapped |
| packages/adapters/storage/sqlite/src/chain/__tests__/history.test.ts | restored current list stays pinned after a header imported without its body | rust/adapters/storage/sqlite/tests/history.rs::restored_current_list_stays_pinned_after_header_only_import | fully mapped |
| packages/adapters/storage/sqlite/src/chain/__tests__/history.test.ts | a list kept for another file's version does not keep pruned blobs | rust/adapters/storage/sqlite/tests/history.rs::retained_lists_do_not_retain_other_files_pruned_blobs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/recovery.test.ts | startup adopts verified content-addressed files after a database restore | rust/adapters/storage/sqlite/tests/recovery.rs::adopts_verified_orphans_removes_invalid_and_temporary_files | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/recovery.test.ts | migration replaces an interrupted backup and live requests prune expired secrets | rust/adapters/storage/sqlite/tests/recovery.rs::live_maintenance_prunes_expired_secrets_and_backups | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/recovery.test.ts | startup does not adopt blobs pending deletion after discard | rust/adapters/storage/sqlite/tests/recovery.rs::honors_pending_garbage_and_preserves_reuploads (present=false) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/recovery.test.ts | startup preserves a blob re-uploaded after garbage was recorded | rust/adapters/storage/sqlite/tests/recovery.rs::honors_pending_garbage_and_preserves_reuploads (present=true) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/transactions.test.ts | login finish groups session consumption, device update and charge refund atomically | rust/adapters/storage/sqlite/tests/durability.rs::login_transaction_rolls_back_all_effects | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/transactions.test.ts | lockout doubles to a 24 hour cap | rust/adapters/storage/sqlite/tests/limits.rs::lockout_doubles_to_daily_cap_and_resets_after_success_or_quiet_period | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | rate strikes reset after a quiet period | rust/adapters/storage/sqlite/tests/limits.rs::quiet_period_resets_first_strike | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | rate strikes reset after success | rust/adapters/storage/sqlite/tests/limits.rs::successful_refund_resets_strikes_before_next_lockout | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | swap quota includes files and rolls back the head | rust/adapters/storage/sqlite/tests/quota.rs::swap_quota_rolls_back_creation_and_head | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | over quota, a list that only deletes still commits | rust/adapters/storage/sqlite/tests/history.rs::over_quota_deletions_commit_but_new_content_does_not | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | expired charges and strikes are pruned across caller-selected buckets | rust/adapters/storage/sqlite/tests/limits.rs::expired_charges_and_strikes_are_pruned_across_buckets | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | over-quota vault: remove | rust/adapters/storage/sqlite/tests/quota.rs::over_quota_metadata_operations_and_imports_match_reference (remove) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | over-quota vault: rotate | rust/adapters/storage/sqlite/tests/quota.rs::over_quota_metadata_operations_and_imports_match_reference (rotate) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | over-quota vault: files | rust/adapters/storage/sqlite/tests/quota.rs::over_quota_metadata_operations_and_imports_match_reference (files) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | over-quota vault: blob | rust/adapters/storage/sqlite/tests/quota.rs::over_quota_metadata_operations_and_imports_match_reference (blob) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | over-quota vault: move | rust/adapters/storage/sqlite/tests/quota.rs::over_quota_metadata_operations_and_imports_match_reference (move) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/limits.test.ts | over-quota vault: repair | rust/adapters/storage/sqlite/tests/quota.rs::over_quota_metadata_operations_and_imports_match_reference (repair) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | creation, token consumption and digest retries | rust/testing/src/storage/contract/chain::creation; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | uncommitted blobs expire and obey quota | rust/testing/src/storage/contract/blobs::blob_staging_contract; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | discard removes inactive imports and refuses active vaults | rust/testing/src/storage/contract/chain::discard; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | chain, credentials and devices survive reopening | rust/testing/src/storage/contract/chain::persistence; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | failed commits roll back all state | rust/testing/src/storage/contract/chain::rollback; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | move and repair state survive reopening | rust/testing/src/storage/contract/repair::repair; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | login states expire and are consumed once | rust/testing/src/storage/contract/access::sessions; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | join tickets expire and commit consumes them | rust/testing/src/storage/contract/access::tickets; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | nonces expire after ten minutes | rust/testing/src/storage/contract/access::nonces; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | rate limits isolate, refund and double | rust/testing/src/storage/contract/access::rates; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | mailbox numbers and write-once slots | rust/testing/src/storage/contract/mailboxes::slots; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | ten mailboxes per vault per rolling hour | rust/testing/src/storage/contract/mailboxes::openings; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | pair commit closes mailbox; approver lasts 24h | rust/testing/src/storage/contract/mailboxes::pairing; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | blob hashes, vault isolation and conflicts | rust/testing/src/storage/contract/blobs::blobs; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/contract.test.ts | history retains versions and repair material | rust/testing/src/storage/contract/blobs::history; runner: rust/adapters/storage/sqlite/tests/contract.rs | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | migrates a synthetic format-zero database after a consistent backup including WAL | rust/adapters/storage/sqlite/tests/durability.rs::migrates_with_consistent_wal_backup | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | refuses incompatible schema -1 clearly | rust/adapters/storage/sqlite/tests/durability.rs::rejects_incompatible_versions (version=-1) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | refuses incompatible schema 2 clearly | rust/adapters/storage/sqlite/tests/durability.rs::rejects_incompatible_versions (version=2) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | partial temporary files and published orphans never become visible | rust/adapters/storage/sqlite/tests/recovery.rs::adopts_verified_orphans_removes_invalid_and_temporary_files | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | process exit during partial blob write leaves no visible partial object | rust/adapters/storage/sqlite/src/blobs/objects_tests.rs::process_exit_during_real_blob_write_leaves_no_visible_partial_object (partial) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | process exit during published blob write leaves no visible partial object | rust/adapters/storage/sqlite/src/blobs/objects_tests.rs::process_exit_during_real_blob_write_leaves_no_visible_partial_object (published) | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | two concurrent workers committing the same head have exactly one winner | rust/adapters/storage/sqlite/tests/durability.rs::concurrent_connections_have_exactly_one_cas_winner | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | startup repairs existing directory, database and sidecar modes | rust/adapters/storage/sqlite/tests/durability.rs::startup_repairs_private_modes | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | discard commits durable blob garbage and pruning retries failed deletion | rust/adapters/storage/sqlite/tests/recovery.rs::failed_garbage_deletion_is_durable_and_retried | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/sqlite.test.ts | fresh format one includes every current lookup index | rust/adapters/storage/sqlite/tests/parity.rs::exact_typescript_schema_and_pragmas | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/permissions.test.ts | startup restricts the data folder and database files with the shared ACL helper | rust/adapters/storage/sqlite/src/db/schema.rs::tests::startup_uses_shared_access_helper_for_directory_and_database | fully mapped |
| packages/adapters/storage/sqlite/src/__tests__/permissions.test.ts | on Windows the data folder and database inherit no access from their parent | rust/adapters/storage/sqlite/tests/permissions.rs::database_and_directory_do_not_inherit_parent_acl [cfg(windows)] | fully mapped |

## Validation and delivery

Format, requested Clippy and native tests passed: 101 passed, zero failed or ignored.
Windows GNU cargo check --tests passed without warnings using Zig for bundled SQLite.
Bun/Rust database interop, exact schema, storage classes and pragmas passed.
Windows ACL runtime requires Windows. No production behavior bug was found.

Commits 389366d8 and 3a27c061 were pushed. Upstream is origin/port/rust.
Both commit commands used explicit crate paths. The SQLite commit nevertheless contains concurrent additions in rust/cli/src/lib.rs and rust/cli/src/program/dispatch.rs introduced through the shared index while pre-commit ran. No history rewrite or removal was attempted.
Initial SQLite pre-commit failed on unrelated generated CLI assets. Removing this slice's bridge-script edit avoided triggering that broad JS check. Hooks were not bypassed.
