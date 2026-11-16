# Adapter sweep fixes

- b1e9f266: fallible rc_path, Bash candidate errors, lossy UTF-8, JS whitespace, PowerShell CRLF handling; every rc_path caller updated.
- 29f3e284: hook rendering happens inside rc transformation, after existing-file validation.
- f4906810: Windows ownership immediately succeeds; Unix ownership stats every entry before deciding.
- 4c37520e: removal rejects dangling checkout-root symlinks.
- ddfbb758: inspection propagates store stat failures other than ENOENT.
- dcf56b62: Tailscale stderr limit counts UTF-16 units.
- ceb0d3a2: global config reads match TS order and /dev/null use, without temporary config files.
- 9b4399f3: upstream ID resolution precedes checkout directory identity reads.
- c901783e: invalid UTF-8 in existing excludes is decoded lossily for comparison and original bytes survive appends.
- 59b9f7e9: invalid Tailscale serve schemas retain a cause.

Each executed native regression failed before its fix. Windows owner-only regression was cross-compiled, not executed on macOS.

Shared-index races during commit hooks included neighboring agents' staged work in b1e9f266 (rust/cli/src/admin/repair/context.rs, rust/cli/src/notice/remote.rs) and c901783e (rust/cli/src/links/fork.rs). These were preserved. No TS source edits were made by this sweep. No new TS bug was found. No PR was created.

- 58a8053c: Windows default PowerShell discovery uses USERPROFILE, not HOME; red-home.log / green-home.log.

Outside-slice follow-up: rust/cli/src/main.rs currently builds user_home from HOME only, whereas TS uses os.homedir(). On Windows with USERPROFILE but no HOME, startup can supply an empty home. Adapter detection was fixed; CLI startup is owned by another sweep agent and was not edited.
