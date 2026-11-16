# audit-adapters

Scope: 262 TS cases. Paths below are relative to rust/. Frozen shared inventory and TS source were not modified.

| Package | TS cases | Fully mapped | Unmappable |
|---|---:|---:|---:|
| core | 79 | 79 | 0 |
| keychain/file | 9 | 9 | 0 |
| network/tailscale | 25 | 25 | 0 |
| placement/fs | 46 | 44 | 2 |
| repo/git | 47 | 47 | 0 |
| shell/rc | 56 | 55 | 1 |

## Bugs found and fixed

Git discovery repeatedly read the global safe-directory configuration. Discovery now loads it once and passes the same configuration to both batched queries. The regression asserts twelve returned files and exactly one ls-files, check-ignore and global configuration command. Red evidence: audit-adapters-batching-red.log; green evidence: audit-adapters-tests.log.

Git also used /dev/null as its empty global config. It now uses a real private temporary file, reused during discovery and deleted when its owner drops. The strengthened regression rejects character devices; audit-adapters-real-config-red.log records the failure. Git was revalidated after this fix in audit-adapters-git-{clippy,tests,windows}.log.

## Verification and limits

cargo fmt and Clippy --all-targets --no-deps -- -D warnings passed for the six crates. Host tests passed (99 Rust tests, zero failures or ignored tests). Windows-only tests compile with cargo check --tests --target x86_64-pc-windows-gnu; Windows runtime execution is not claimed. Fallback maps to Rust's statically selected Windows implementation. Temp directory prefixes, platform uid and Rust test-runtime launch syntax replace their TS fixture equivalents. The core storage commit case remains mapped to the existing envden-testing assertion. Native race callbacks match TS beforeRename/beforeUnlink; RC callbacks match resolved/opened/read. No timing races or sleeps were added.

The two dynamic FFI cases cannot be recreated: rustix and the native ABI are selected at compilation. Rust has no Bun FFI loader or runtime symbol fallback. The JS shell exception-dispatch case has no Rust unknown-exception counterpart; the Rust IO failure privacy half is covered, but this row is not counted as fully mapped.

## Case map

### core

| TS case | Status | Rust assertion |
|---|---|---|
| /repos holds /repos as root | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| /repos holds /repos/ as root | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| /repos holds /repos/a as inside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| /repos holds /repos/..cache as inside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| /repos holds /repos/a/../b as inside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| /repos holds / as outside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| /repos holds /repos-other as outside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| /repos holds /repos/../x as outside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| C:\repos holds C:\repos as root | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| C:\repos holds c:/repos/a as inside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| C:\repos holds C:\repos\..cache as inside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| C:\repos holds C:\ as outside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| C:\repos holds C:\repos\..\x as outside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| C:\repos holds D:\repos\a as outside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| C:\repos holds \\server\share\repos as outside | fully mapped | core/tests/paths_release.rs::containment_matches_posix_and_windows |
| selection preserves concurrent-edit rules | fully mapped | core/tests/merge.rs::selection_and_value_decisions |
| value validation | fully mapped | core/tests/merge.rs::selection_and_value_decisions |
| raw assignments include preceding comments and preserve non-UTF8 bytes | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| a leading BOM stays at the start of a merge | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| merged lines follow the local line ending | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| local layout and remote additions in remote order | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided deletion | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| both delete | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| remote append after local file without newline | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| selected entries never join adjacent assignments | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| concurrent appends do not duplicate a former tail | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| identical concurrent entries are clean | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| two-sided independent changes preserve source lines | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: duplicate-key B=1\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: unterminated-quote A='no | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: multiline-value A="one\ntwo"\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: multiline-value A=one\\ntwo\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: both-changed A=2\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: delete-vs-edit  | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: style-change export A=1\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: style-change A="1"\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: comment-toggle-vs-edit # A=1\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: both-changed # after\nA=1\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: unsupported-syntax source other.env\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| conflict: layout-change A=2\n# old\n | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| diff returns names only | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| seeded one-sided changes reproduce bytes in either direction | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| a comment moved to different keys on both sides conflicts | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| equality shortcuts precede parsing and style checks | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| final line terminators do not change key selection | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided comment move merges cleanly: "\n" # moved local | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided comment move merges cleanly: "\n" # moved remote | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided comment move merges cleanly: "\n" # first\n# second local | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided comment move merges cleanly: "\n" # first\n# second remote | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided comment move merges cleanly: "\r\n" # moved local | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided comment move merges cleanly: "\r\n" # moved remote | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided comment move merges cleanly: "\r\n" # first\n# second local | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| one-sided comment move merges cleanly: "\r\n" # first\n# second remote | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| a key changed on both sides is marked alone and the rest merges | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| a key deleted on one side keeps an empty side in its block | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| without a base or a parse, the whole file is one block | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| marker detection finds only whole marker lines | fully mapped | core/tests/merge.rs::typescript_merge_vectors |
| private keychain files and directories get POSIX modes or explicit non-inherited Windows ACLs | fully mapped | core/tests/process.rs::permissions_and_acl_arguments |
| the synchronous variant applies the same mode or Windows ACL | fully mapped | core/tests/process.rs::permissions_and_acl_arguments |
| renamed and separate-git-dir checkouts on PATH cannot supply tools | fully mapped | core/src/process/parity.rs::renamed_and_separate_git_dir_on_path_cannot_supply_tools |
| registry rejects symlink targets and child directories without git markers | fully mapped | core/tests/process/trust.rs::trust_registry_and_checkout_rejection |
| env shebang searches fixed system directories before user symlink payloads | fully mapped | core/src/process/parity.rs::env_shebang_searches_system_before_user_symlink_payload |
| environment drops code loading variables and only keeps explicit git settings | fully mapped | core/tests/process.rs::environment_allowlist |
| writable directories, git files, and symlinks into checkouts are rejected | fully mapped | core/tests/process/trust.rs::trust_registry_and_checkout_rejection |
| sync subprocesses use the same executable and environment policy | fully mapped | core/src/process/parity.rs::runtime_executes_with_sanitized_environment |
| a package manager root that is a git repository is not a user checkout | fully mapped | core/tests/process/trust.rs::trust_registry_and_checkout_rejection |
| group write is trusted only for privileged groups | fully mapped | core/tests/process.rs::owner_mode_policy |
| manager bin is appended to fixed child PATH and rejected inside registered roots | fully mapped | core/tests/process/trust.rs::trust_registry_and_checkout_rejection |
| Windows fixed directories use canonical drive paths | fully mapped | core/tests/process.rs::directory_policy |
| a fake Homebrew root on Linux is still a checkout | fully mapped | core/src/process/parity.rs::fake_homebrew_on_linux_remains_a_checkout |
| the running runtime is trusted without trusting its directory or PATH | fully mapped | core/src/process/parity.rs::runtime_executes_with_sanitized_environment |
| commit preconditions throw typed EnvdenErrors | fully mapped | testing/tests/commit.rs::commit_preconditions_throw_typed_errors |
| reads text and binary entries with either line ending | fully mapped | core/tests/paths_release.rs::sha256sum_entries |
| rejects empty | fully mapped | core/tests/paths_release.rs::sha256sum_entries |
| rejects short hash | fully mapped | core/tests/paths_release.rs::sha256sum_entries |
| rejects non-hex hash | fully mapped | core/tests/paths_release.rs::sha256sum_entries |
| rejects single space | fully mapped | core/tests/paths_release.rs::sha256sum_entries |
| rejects spaced name | fully mapped | core/tests/paths_release.rs::sha256sum_entries |
| rejects duplicate | fully mapped | core/tests/paths_release.rs::sha256sum_entries |

### keychain/file

| TS case | Status | Rust assertion |
|---|---|---|
| missing and repeated deletion are harmless | fully mapped | adapters/keychain/file/tests/contract.rs; testing/src/keychain/contract.rs |
| binary values, replacement, empty values and names stay isolated | fully mapped | adapters/keychain/file/tests/contract.rs; testing/src/keychain/contract.rs |
| keys are owner-only files that survive a new adapter | fully mapped | adapters/keychain/file/tests/parity.rs::owner_only_keys_survive_new_adapter |
| file keys with long names fit in one path component | fully mapped | adapters/keychain/file/tests/contract.rs::persists_long_names_and_fixed_failures |
| a required key that isn't stored fails closed | fully mapped | adapters/keychain/file/tests/contract.rs::permissions_and_required |
| a file readable by others is reported | fully mapped | adapters/keychain/file/tests/contract.rs::permissions_and_required |
| a directory readable by others is reported | fully mapped | adapters/keychain/file/tests/contract.rs::permissions_and_required |
| key storage failures use a fixed typed message | fully mapped | adapters/keychain/file/tests/contract.rs::persists_long_names_and_fixed_failures |
| key files drop inherited Windows ACL entries | fully mapped | adapters/keychain/file/tests/parity.rs::keys_drop_inherited_acl_entries (cfg windows) |

### network/tailscale

| TS case | Status | Rust assertion |
|---|---|---|
| serve on its own port: nothing served | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: empty output | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: null output | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: same target | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: other port only on another host | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: different target | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: extra path | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: raw TCP forward | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: listener without a site | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| serve on its own port: another app on 443 | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| unreadable serve status is refused | fully mapped | adapters/network/tailscale/src/serve.rs::tests::conflicts_and_invalid_schemas |
| ready status publishes a secure device address | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| not-installed fails closed and names the cause | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| not-running fails closed and names the cause | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| logged-out fails closed and names the cause | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| https-disabled fails closed and names the cause | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| unreadable fails closed and names the cause | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| an address already serving something else is not replaced | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| publication failures propagate | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| invalid ports cannot be published | fully mapped | adapters/network/tailscale/tests/contract.rs; testing/src/network/contract.rs |
| status and serve use the recorded JSON and current CLI syntax | fully mapped | adapters/network/tailscale/tests/parity.rs::recorded_status_and_commands |
| status names the cause: daemon down | fully mapped | adapters/network/tailscale/tests/parity.rs::unavailable_certificate_causes |
| status names the cause: malformed | fully mapped | adapters/network/tailscale/tests/parity.rs::unavailable_certificate_causes |
| serve failures carry Tailscale's own output, capped | fully mapped | adapters/network/tailscale/tests/contract.rs::recorded_status_and_capped_serve_failure |
| serve refuses to replace another service on its port, and leaves 443 alone | fully mapped | adapters/network/tailscale/tests/parity.rs::conflict_never_publishes_or_changes_port_443 |

### placement/fs

| TS case | Status | Rust assertion |
|---|---|---|
| copy prepares its exclusion before writing and replaces a leftover for this destination | fully mapped | adapters/placement/fs/tests/safety.rs::copy_excludes_before_writing_and_replaces_only_its_leftover |
| reject ".g‌it/config" | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| reject "nested/‍.env" | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| reject ".git/config" | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| reject ".GIT/x" | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| reject "GIT~1/.env" | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| reject "nested/ENV~2" | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| reject ".env~1" | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| local paths retain Unicode format characters | fully mapped | adapters/placement/fs/src/paths.rs::tests::local_paths_preserve_unicode_format_characters |
| existing local Unicode copies can be inspected and removed | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| placement can be inspected, repeated and removed | fully mapped | adapters/placement/fs/tests/contract.rs; testing/src/placement/contract.rs |
| refuses unrelated links and linked parents and backs up overwrites | fully mapped | adapters/placement/fs/tests/contract.rs; testing/src/placement/contract.rs |
| inspection distinguishes equal copies and changed files | fully mapped | adapters/placement/fs/tests/contract.rs; testing/src/placement/contract.rs |
| rejects paths outside the checkout and directory destinations | fully mapped | adapters/placement/fs/tests/contract.rs; testing/src/placement/contract.rs |
| placement can be inspected, repeated and removed | fully mapped | adapters/placement/fs/tests/contract.rs; testing/src/placement/contract.rs |
| refuses unrelated links and linked parents and backs up overwrites | fully mapped | adapters/placement/fs/tests/contract.rs; testing/src/placement/contract.rs |
| inspection distinguishes equal copies and changed files | fully mapped | adapters/placement/fs/tests/contract.rs; testing/src/placement/contract.rs |
| rejects paths outside the checkout and directory destinations | fully mapped | adapters/placement/fs/tests/contract.rs; testing/src/placement/contract.rs |
| placement rejects Unicode format characters without creating the path | fully mapped | adapters/placement/fs/tests/paths.rs::pulled_and_local_unicode_paths |
| reject escaping parent and destination symlinks without touching targets | fully mapped | adapters/placement/fs/tests/escaping.rs::escaping_links_leave_targets_untouched |
| copy backups stay outside checkout, are private, and skip equal contents | fully mapped | adapters/placement/fs/tests/safety.rs::backups_are_required_private_outside_and_not_repeated_for_equal_bytes |
| link backups stay outside checkout, are private, and skip equal contents | fully mapped | adapters/placement/fs/tests/safety.rs::backups_are_required_private_outside_and_not_repeated_for_equal_bytes |
| backup directory is required for differing content and cannot be in checkout | fully mapped | adapters/placement/fs/tests/parity.rs::differing_bytes_require_backup_and_equal_bytes_use_injected_clock |
| pruning uses caller time and keeps recent, unrelated and symlink entries | fully mapped | adapters/placement/fs/tests/parity.rs::retention_uses_names_instead_of_file_timestamps |
| remove refuses unrelated links, unsafe parents and directories | fully mapped | adapters/placement/fs/tests/safety.rs::removal_and_missing_store_inspection_preserve_unrelated_contents |
| parent identity rejects replacement directories even without symlinks | fully mapped | adapters/placement/fs/src/windows/tests.rs::parent_snapshots_reject_replacement_directories (cfg windows) |
| copy placement uses private POSIX modes | fully mapped | adapters/placement/fs/tests/contract.rs::temporary_exclude_and_permissions |
| copy placement restricts Windows file ACLs | fully mapped | adapters/placement/fs/tests/windows.rs::copy_drops_inherited_acl_entries (cfg windows) |
| inspection reports a regular file beside a missing store as detached | fully mapped | adapters/placement/fs/tests/parity.rs::missing_store_leaves_regular_copy_detached_in_link_mode |
| placement backup creation uses the injected clock | fully mapped | adapters/placement/fs/tests/parity.rs::differing_bytes_require_backup_and_equal_bytes_use_injected_clock |
| fallback replaces a user's link only when given its exact text | fully mapped | adapters/placement/fs/src/windows/tests.rs::fallback_modes_repeat_remove_and_replace_exact_link_text (cfg windows) |
| fallback copy creates private parents, replaces matching files and removes safely | fully mapped | adapters/placement/fs/src/windows/tests.rs::fallback_modes_repeat_remove_and_replace_exact_link_text (cfg windows) |
| fallback link creates private parents, replaces matching files and removes safely | fully mapped | adapters/placement/fs/src/windows/tests.rs::fallback_modes_repeat_remove_and_replace_exact_link_text (cfg windows) |
| fallback refuses unsafe roots, parents, sources and destinations without changing contents | fully mapped | adapters/placement/fs/src/windows/unsafe_tests.rs::fallback_refuses_unsafe_roots_parents_sources_and_destinations (cfg windows) |
| fallback backup requires private ACLs before writing and rejects checkout aliases | fully mapped | adapters/placement/fs/src/windows/tests.rs::backup_restricts_before_writing_and_rejects_aliases (cfg windows) |
| fallback preserves the original error and removes staged plaintext | fully mapped | adapters/placement/fs/src/windows/tests.rs::failure_preserves_original_error_and_removes_plaintext (cfg windows) |
| fallback placement treats a link through a linked home as the store | fully mapped | adapters/placement/fs/src/windows/unsafe_tests.rs::fallback_recognizes_store_through_linked_home (cfg windows) |
| native placement treats a link through a linked home as the store | fully mapped | adapters/placement/fs/tests/parity.rs::linked_home_targets_and_exact_replacement_text |
| stat bindings prefer modern symbols and select the legacy architecture version | unmappable | UNMAPPABLE: rustix selects stat ABI at compile time; no dynamic symbol/version selector exists |
| native filesystem operations load on supported 64-bit POSIX platforms | fully mapped | adapters/placement/fs/src/races.rs::exclusive_writes_and_nofollow_identity |
| copy rename stays on the opened directory after a parent swap | fully mapped | adapters/placement/fs/src/races.rs::rename_and_backup_stay_on_opened_directory_after_swap |
| link rename stays on the opened directory after a parent swap | fully mapped | adapters/placement/fs/src/races.rs::rename_and_backup_stay_on_opened_directory_after_swap |
| descriptor writes are exclusive and identity checks do not follow links | fully mapped | adapters/placement/fs/src/races.rs::exclusive_writes_and_nofollow_identity |
| unlink stays anchored after a parent swap | fully mapped | adapters/placement/fs/src/races.rs::unlink_stays_anchored_after_parent_swap |
| backup reads stay anchored after a parent swap | fully mapped | adapters/placement/fs/src/races.rs::rename_and_backup_stay_on_opened_directory_after_swap |
| FFI and binding failures select the non-native fallback | unmappable | UNMAPPABLE: native Rust linkage has no dynamic Bun FFI import/binding fallback |

### repo/git

| TS case | Status | Rust assertion |
|---|---|---|
| case probes use an existing spelling and distinguish listed aliases | fully mapped | adapters/repo/git/src/case.rs::tests::probes_existing_spelling_and_listed_aliases |
| read-only case detection never creates a filesystem probe | fully mapped | adapters/repo/git/tests/repo.rs::unsafe_remotes_and_readonly_case |
| git ignores global execution settings while retaining safe directories | fully mapped | adapters/repo/git/src/parity.rs::global_execution_settings_are_ignored_but_safe_directories_survive |
| repo IDs follow global and local url rewrites | fully mapped | adapters/repo/git/tests/parity.rs::identities_follow_global_and_local_url_rewrites |
| checkout lookup preserves trusted executable failures | fully mapped | adapters/repo/git/src/parity.rs::checkout_preserves_trusted_executable_failure |
| finds the checkout from nested paths and lists it among worktrees | fully mapped | adapters/repo/git/tests/contract.rs; testing/src/repo/contract.rs |
| submodule paths follow .gitmodules quoting, and no file means none | fully mapped | adapters/repo/git/tests/contract.rs; testing/src/repo/contract.rs |
| discovery skips unencodable and unreadable directories | fully mapped | adapters/repo/git/tests/contract.rs; testing/src/repo/contract.rs |
| already ignored paths accept special characters and case detection matches the filesystem | fully mapped | adapters/repo/git/tests/contract.rs; testing/src/repo/contract.rs |
| env file rules configure include, exclude and skipped directories | fully mapped | adapters/repo/git/tests/contract.rs; testing/src/repo/contract.rs |
| ignores exact env paths idempotently and discovers only eligible files | fully mapped | adapters/repo/git/tests/contract.rs; testing/src/repo/contract.rs |
| tracked paths respect the probed checkout filesystem | fully mapped | adapters/repo/git/tests/parity.rs::escaping_and_case_probed_tracking |
| normalize git@GitHub.com:Owner/Repo.git | fully mapped | adapters/repo/git/src/remote.rs::tests::vectors |
| normalize ssh://git@GitLab.com/Group/Sub/Repo.git | fully mapped | adapters/repo/git/src/remote.rs::tests::vectors |
| normalize https://GitHub.com/Owner/Repo.git | fully mapped | adapters/repo/git/src/remote.rs::tests::vectors |
| normalize git@work:Owner/Repo.git | fully mapped | adapters/repo/git/src/remote.rs::tests::vectors |
| normalize git@ssh.dev.azure.com:v3/Org/Project/Repo | fully mapped | adapters/repo/git/src/remote.rs::tests::vectors |
| normalize https://dev.azure.com/Org/Project/_git/Repo | fully mapped | adapters/repo/git/src/remote.rs::tests::vectors |
| normalize ssh://git@HOST.test:2222/Team/Sub/Repo.git | fully mapped | adapters/repo/git/src/remote.rs::tests::vectors |
| normalize git://HOST.test/Team/Repo.git | fully mapped | adapters/repo/git/src/remote.rs::tests::vectors |
| reject remote /tmp/repo | fully mapped | adapters/repo/git/tests/parity.rs::exact_remote_rejections |
| reject remote https://host/../ | fully mapped | adapters/repo/git/tests/parity.rs::exact_remote_rejections |
| reject remote git@host:../repo | fully mapped | adapters/repo/git/tests/parity.rs::exact_remote_rejections |
| reject remote https://host/a/%2e%2e/b.git | fully mapped | adapters/repo/git/tests/parity.rs::exact_remote_rejections |
| reject remote file:///tmp/repo | fully mapped | adapters/repo/git/tests/parity.rs::exact_remote_rejections |
| checkout, only remote fallback, alias resolution and shared worktrees | fully mapped | adapters/repo/git/tests/checkout.rs::sole_remote_alias_resolution_shared_worktrees_and_ambiguous_remotes |
| discovery filters templates, envrc, outputs, unignored and tracked files | fully mapped | adapters/repo/git/tests/security.rs::discovery_filters_templates_tracked_outputs_and_preserves_user_links |
| exclude patterns escape git syntax and refuse control characters | fully mapped | adapters/repo/git/tests/parity.rs::escaping_and_case_probed_tracking |
| non-repos and ambiguous remotes | fully mapped | adapters/repo/git/tests/checkout.rs::sole_remote_alias_resolution_shared_worktrees_and_ambiguous_remotes |
| reject decoded terminal control %1b | fully mapped | adapters/repo/git/tests/parity.rs::exact_remote_rejections |
| reject decoded terminal control %E2%80%AE | fully mapped | adapters/repo/git/tests/parity.rs::exact_remote_rejections |
| a forged git file is not a registered worktree | fully mapped | adapters/repo/git/tests/security.rs::checkout_identity_errors_upstream_and_forged_worktree |
| a .gitignore linked into dotfiles is never written | fully mapped | adapters/repo/git/tests/excludes.rs::linked_gitignore_is_never_written |
| exclude refuses symlink files and parents | fully mapped | adapters/repo/git/tests/excludes.rs::symlink_and_hardlink_excludes_preserve_exact_target_bytes |
| filesystem failures are typed and do not expose command output | fully mapped | adapters/repo/git/tests/security.rs::checkout_identity_errors_upstream_and_forged_worktree |
| checkout exposes normalized upstream identity alongside the fork | fully mapped | adapters/repo/git/tests/security.rs::checkout_identity_errors_upstream_and_forged_worktree |
| git disables executable repository configuration for every read command | fully mapped | adapters/repo/git/src/parity.rs::every_read_command_disables_repository_fsmonitor |
| exclude refuses hardlinks without modifying their target | fully mapped | adapters/repo/git/tests/excludes.rs::symlink_and_hardlink_excludes_preserve_exact_target_bytes |
| failed ignore attempts do not change exclude bytes | fully mapped | adapters/repo/git/tests/excludes.rs::ignore_failure_preserves_original_git_exclude_bytes |
| embedded bare repositories cannot choose checkout identity | fully mapped | adapters/repo/git/tests/parity.rs::embedded_bare_repository_cannot_choose_identity |
| checkout lookup propagates filesystem failures | fully mapped | adapters/repo/git/tests/security.rs::checkout_identity_errors_upstream_and_forged_worktree |
| worktrees whose folder is gone are not listed | fully mapped | adapters/repo/git/src/parity.rs::legacy_git_worktree_listing_falls_back_and_excludes_gone_worktrees |
| worktrees are listed by git that predates worktree list -z | fully mapped | adapters/repo/git/src/parity.rs::legacy_git_worktree_listing_falls_back_and_excludes_gone_worktrees |
| discovery batches git queries and reuses a real empty global config | fully mapped | adapters/repo/git/src/batching_tests.rs::discovery_batches_queries_with_one_global_configuration_read |
| discovery skips submodules and nested clones, lists the user's own links and prints nothing | fully mapped | adapters/repo/git/tests/discovery.rs::discovery_skips_submodules_and_nested_clones_and_lists_user_links |
| custom env patterns cannot allow shell hooks or skipped folders | fully mapped | adapters/repo/git/tests/discovery.rs::discovery_skips_submodules_and_nested_clones_and_lists_user_links |
| SSH aliases resolve only through option-terminated safe hosts | fully mapped | adapters/repo/git/src/parity.rs::ssh_only_executes_safe_option_terminated_hosts |

### shell/rc

| TS case | Status | Rust assertion |
|---|---|---|
| rc timestamp baseline comes from lstat even if fstat rounds timestamps | fully mapped | adapters/shell/rc/src/identity.rs::tests::baseline_uses_path_timestamps_when_opened_timestamps_round |
| install and uninstall are idempotent and preserve user configuration | fully mapped | adapters/shell/rc/tests/contract.rs; testing/src/shell/contract.rs |
| install creates missing parent directories | fully mapped | adapters/shell/rc/tests/contract.rs; testing/src/shell/contract.rs |
| install and uninstall are idempotent and preserve user configuration | fully mapped | adapters/shell/rc/tests/contract.rs; testing/src/shell/contract.rs |
| install creates missing parent directories | fully mapped | adapters/shell/rc/tests/contract.rs; testing/src/shell/contract.rs |
| install and uninstall are idempotent and preserve user configuration | fully mapped | adapters/shell/rc/tests/contract.rs; testing/src/shell/contract.rs |
| install creates missing parent directories | fully mapped | adapters/shell/rc/tests/contract.rs; testing/src/shell/contract.rs |
| install and uninstall are idempotent and preserve user configuration | fully mapped | adapters/shell/rc/tests/contract.rs; testing/src/shell/contract.rs |
| install creates missing parent directories | fully mapped | adapters/shell/rc/tests/contract.rs; testing/src/shell/contract.rs |
| zsh install edits a dotfiles target, keeps the link and backs up privately | fully mapped | adapters/shell/rc/tests/links.rs::all_shells_edit_linked_targets_and_keep_private_backups |
| zsh uninstall edits a dotfiles target, keeps the link and backs up privately | fully mapped | adapters/shell/rc/tests/links.rs::all_shells_edit_linked_targets_and_keep_private_backups |
| bash install edits a dotfiles target, keeps the link and backs up privately | fully mapped | adapters/shell/rc/tests/links.rs::all_shells_edit_linked_targets_and_keep_private_backups |
| bash uninstall edits a dotfiles target, keeps the link and backs up privately | fully mapped | adapters/shell/rc/tests/links.rs::all_shells_edit_linked_targets_and_keep_private_backups |
| fish install edits a dotfiles target, keeps the link and backs up privately | fully mapped | adapters/shell/rc/tests/links.rs::all_shells_edit_linked_targets_and_keep_private_backups |
| fish uninstall edits a dotfiles target, keeps the link and backs up privately | fully mapped | adapters/shell/rc/tests/links.rs::all_shells_edit_linked_targets_and_keep_private_backups |
| powershell install edits a dotfiles target, keeps the link and backs up privately | fully mapped | adapters/shell/rc/tests/links.rs::all_shells_edit_linked_targets_and_keep_private_backups |
| powershell uninstall edits a dotfiles target, keeps the link and backs up privately | fully mapped | adapters/shell/rc/tests/links.rs::all_shells_edit_linked_targets_and_keep_private_backups |
| fish install and uninstall write through a linked folder or dangling link | fully mapped | adapters/shell/rc/tests/links.rs::edits_through_linked_folders_and_dangling_links |
| zsh install and uninstall write through a linked folder or dangling link | fully mapped | adapters/shell/rc/tests/links.rs::edits_through_linked_folders_and_dangling_links |
| rc swap after resolved cannot copy private bytes into the checkout | fully mapped | adapters/shell/rc/src/races.rs::swaps_never_copy_private_bytes_to_checkout |
| rc swap after opened cannot copy private bytes into the checkout | fully mapped | adapters/shell/rc/src/races.rs::swaps_never_copy_private_bytes_to_checkout |
| rc swap after read cannot copy private bytes into the checkout | fully mapped | adapters/shell/rc/src/races.rs::swaps_never_copy_private_bytes_to_checkout |
| rc editing rejects hard links and non-files without changing their contents | fully mapped | adapters/shell/rc/tests/editing.rs::hard_links_and_dangling_links; src/races.rs::readonly_replacement_preserves_mode_and_leaves_no_temporary |
| install never copies a privately resolved rc into a swapped checkout file | fully mapped | adapters/shell/rc/src/races.rs::resolved_private_file_does_not_follow_swapped_checkout |
| uninstall never copies a privately resolved rc into a swapped checkout file | fully mapped | adapters/shell/rc/src/races.rs::resolved_private_file_does_not_follow_swapped_checkout |
| rc install preserves non-UTF-8 bytes, mode and CRLF without duplicate blocks | fully mapped | adapters/shell/rc/tests/bytes.rs::non_utf8_crlf_install_is_idempotent |
| rc editing replaces read-only files and preserves their permissions | fully mapped | adapters/shell/rc/src/races.rs::readonly_replacement_preserves_mode_and_leaves_no_temporary |
| rc append during editing is retained and reported as a conflict | fully mapped | adapters/shell/rc/src/races.rs::concurrent_append_is_retained_as_conflict |
| macOS bash chooses a login profile unless it sources bashrc | fully mapped | adapters/shell/rc/src/profile_tests.rs::bash_login_profile_matrix |
| bash selects .profile for # user | fully mapped | adapters/shell/rc/src/profile_tests.rs::bash_login_profile_matrix |
| bash selects .bash_login for # user | fully mapped | adapters/shell/rc/src/profile_tests.rs::bash_login_profile_matrix |
| bash selects .bashrc for # >>> envden >>> | fully mapped | adapters/shell/rc/src/profile_tests.rs::bash_login_profile_matrix |
| bash selects .bashrc for [ -f ~/.bashrc ] && . ~/.bashrc | fully mapped | adapters/shell/rc/src/profile_tests.rs::bash_login_profile_matrix |
| bash selects .bashrc for if true; then . ~/.bashrc; fi | fully mapped | adapters/shell/rc/src/profile_tests.rs::bash_login_profile_matrix |
| bash selects .bashrc for [[ -r ~/.bashrc ]] && source ~/.bashrc | fully mapped | adapters/shell/rc/src/profile_tests.rs::bash_login_profile_matrix |
| bash selects .bash_profile for # source ~/.bashrc | fully mapped | adapters/shell/rc/src/profile_tests.rs::bash_login_profile_matrix |
| rc install and uninstall keep user lines after an orphan start marker | fully mapped | adapters/shell/rc/tests/bytes.rs::orphan_marker_keeps_user_lines |
| zsh hook snapshot | fully mapped | adapters/shell/rc/tests/render.rs::typescript_vectors (snapshots.json extracted from frozen Bun snapshots) |
| bash hook snapshot | fully mapped | adapters/shell/rc/tests/render.rs::typescript_vectors (snapshots.json extracted from frozen Bun snapshots) |
| fish hook snapshot | fully mapped | adapters/shell/rc/tests/render.rs::typescript_vectors (snapshots.json extracted from frozen Bun snapshots) |
| powershell hook snapshot | fully mapped | adapters/shell/rc/tests/render.rs::typescript_vectors (snapshots.json extracted from frozen Bun snapshots) |
| bash prints only inside an approved checkout and sanitizes refresh | fully mapped | adapters/shell/rc/tests/execution.rs::approved_checkout_notices_and_sanitized_refresh |
| zsh prints only inside an approved checkout and sanitizes refresh | fully mapped | adapters/shell/rc/tests/execution.rs::approved_checkout_notices_and_sanitized_refresh |
| fish tries GNU stat before the BSD fallback | fully mapped | adapters/shell/rc/tests/behavior.rs::rendered_shell_compatibility_guards |
| PowerShell gates notices on a directory change | fully mapped | adapters/shell/rc/tests/behavior.rs::rendered_shell_compatibility_guards |
| bash caches track offers and update days | fully mapped | adapters/shell/rc/tests/execution.rs::track_offer_and_update_day_caches |
| zsh caches track offers and update days | fully mapped | adapters/shell/rc/tests/execution.rs::track_offer_and_update_day_caches |
| PowerShell doubles all single quote delimiters in paths | fully mapped | adapters/shell/rc/tests/behavior.rs::rendered_shell_compatibility_guards |
| bash hook preserves the exit status for following prompt commands | fully mapped | adapters/shell/rc/tests/behavior.rs::bash_preserves_prompt_exit_status |
| fish escapes backslashes and quotes in paths and avoids fish 3.5 builtins | fully mapped | adapters/shell/rc/tests/behavior.rs::rendered_shell_compatibility_guards |
| PowerShell refresh arguments work on Windows PowerShell 5.1 | fully mapped | adapters/shell/rc/tests/behavior.rs::rendered_shell_compatibility_guards |
| PowerShell profile resolution uses trusted runner and redirected Documents | fully mapped | adapters/shell/rc/src/profile_tests.rs::powershell_runner_and_redirected_profile |
| PowerShell validates profile paths and resolves once per adapter | fully mapped | adapters/shell/rc/src/profile_tests.rs::profiles_validate_output_prefer_existing_hook_and_cache_resolution |
| PowerShell prefers an existing envden hook over the first executable | fully mapped | adapters/shell/rc/src/profile_tests.rs::profiles_validate_output_prefer_existing_hook_and_cache_resolution |
| PowerShell accepts redirected profiles outside home and rejects unsafe output | fully mapped | adapters/shell/rc/src/profile_tests.rs::profiles_validate_output_prefer_existing_hook_and_cache_resolution |
| shell failures preserve domain errors and hide unexpected error text | unmappable | UNMAPPABLE: JS unknown-exception dispatch has no typed Rust equivalent; Rust IO error privacy is asserted in src/races.rs::unexpected_errors_hide_private_shell_contents |


## Commits

afa9261 (core), 94be874 (keychain/file), ed9f7c8 (network/tailscale), 78ff22f (placement/fs), e665c82 (shell/rc), a233b3f (repo/git). Each was pushed separately. Assigned crate paths are clean; branch tracks origin/port/rust.
