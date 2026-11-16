# Sweep 2 observations

Fixed: lost repair epoch-key lookup panics; file-linking module responsibilities; dangling store symlink existence semantics.

Confirmed source gaps still requiring failing-first tests and fixes:
- FIXED d7c5597: repair finish now fetches currentMaterial once for both name groups; regression observed two requests before and one after.
- repair upload reads remote history before reading envelope.bin; TS reads envelope.bin first.
- RESOLVED BY OTHER AGENT: admin commit::accept now calls shared join acceptance, so repair callers use the shared membership handling.
- FIXED: doctor probe directory and target now use 0700 and 0600; red/green tests recorded.
- FIXED: notice current repo matching resolves cwd before comparing; red/green tests recorded.
- FIXED: SSH hostname parser accepts whitespace, including a tab; red/green tests recorded.

Not yet fully compared: all PENDING functions in checklist.md, plus adapter class methods and arrow-only callbacks that the named-function inventory does not enumerate. No full-sweep completion claim is justified by this artifact.

Panic/index scan: lost map indexing was reachable with absent epoch data. Other observed map indexes are guarded by schema checks or maps populated in the same pass (notice recovery names, serve handlers, encoded verified device map). History last() calls follow read_history's nonempty check except locally cached repair history, whose upload checks its last header. Fixed-size slices and array conversions follow explicit length checks. Static regex captures/patterns and embedded font metrics are not untrusted data. Agent write_through root-path parent expectations remain to audit.


Trim addition: all requested TS-equivalent trim sites now use shared JS helpers (5c73f28). See trim-lines.md for exact TS lines, Rust-only exceptions, and preceding sanitization that makes some substitutions behavior-neutral. BOM/NEL regression failures and passes are saved in red-trim-* and green-trim-* logs.

Further differences found while tracing, not yet fixed:
- Bash profile candidate reads use read_to_string(...).ok(), swallowing failures that TS rethrows except ENOENT. Rust rc_path returns String while TS can throw, so a faithful fix needs an interface/caller decision beyond the owned adapter files.
- Keychain owner_only reads/stats keys on Windows; TS returns true immediately on Windows.

Commits:
- 60d2e77c repair missing key error, from panicking map access; isolated red and Cargo green.
- 6d29506d split link-file responsibilities, no behavior change.
- 5d425138 dangling store links, from following the symlink rather than lstat; Cargo red/green.
- 07a88cb0 SSH whitespace, from literal-space parsing; Cargo red/green. A shared-index race also included another agent's parity/scenarios/onboarding/rejoin.ts changes.
- a076aa5a current checkout notice, from matching unresolved cwd; isolated and Cargo red/green.
- 152a822 doctor probe modes, from default directory/file creation modes; Cargo red/green.
- d7c5597 repair naming material request count; Cargo red/green.
- 5c73f28 JS trim semantics, from Rust Unicode whitespace; Cargo red/green for affected paths.

- Move abort with an empty saved move-pin: TS reports Missing move pin; Rust tries to decode the empty string before failing. Requires a failing-first error-path test and fix.

- installedPort uses Rust regex whitespace; TS regex whitespace accepts BOM and excludes NEL. Its decoder needs the same whitespace-class review as SSH, with failing-first cases.
