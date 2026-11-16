# Go implementation differences

The canonical list of differences between the implementations is `docs/implementations.md` on `main`. This file keeps only what is specific to Go. Each entry: what differs, and why it stays. None of them changes a stored byte, a wire byte, an exit code or a decision.

## Runtime error text

A trusted executable that fails to start, a filesystem error outside an `EnvdenError`, or an unexpected server error shows Go's own errno wording and path format. Server logs carry a sanitized internal error instead of stack frames. Typed errors, protocol error bodies and normal output are unchanged.

## HTTP framing

`net/http` owns header order, early responses to malformed requests and connection reuse. For absolute-form requests it takes the host from the request target. HTTP/1.1 without `Host` is refused before routing; HTTP/1.0 without `Host` gets 404. It sends `100 Continue` before routing, and HEAD sends `Content-Length: 0`. Route status, content type and body are the same.

## Library diagnostic text

OPAQUE failures carry `bytemare/opaque` text, and wire JSON that fails a schema reports `INVALID_DATA` "Invalid protocol data" instead of a schema library's message. A wrong-password login returns no error and `OK=false`. Every explicit `EnvdenError` message is kept.

## HPKE test method

`crypto/hpke` can't take an injected ephemeral key, so the tests open the stored wrap vectors and check their ephemeral public keys instead of reproducing the ciphertext. Production wraps use a fresh key either way.

## Unicode table versions

`golang.org/x/text` ships Unicode 15 tables. Normalization differs from Unicode 17 for 57 scalars (U+A7F1, U+105C9, U+105E4, U+11383, U+11385, U+1138E, U+11391, U+113C5, U+113C7..U+113C8, U+16121..U+16128, U+16D68..U+16D6A, U+1CCD6..U+1CCF9) and case mapping for 110 (U+019B, U+0264, U+1C89..U+1C8A, U+A7CB..U+A7CF, U+A7D2..U+A7D5, U+A7DA..U+A7DC, U+10D50..U+10D65, U+10D70..U+10D85, U+16EA0..U+16EB8, U+16EBB..U+16ED3). Only names and passwords that use these characters are affected. The fix is the same table version everywhere.

## Prompt keystrokes

Prompts use huh and bubbletea. Tab submits like Enter; `y`/`n`, arrows, `h`/`l` and Space answer a yes/no question; `x` and Space toggle a checkout. Ctrl-C, Esc and Ctrl-D cancel with the same message and exit code. Bracketed paste is off and keys after an accepted Enter are dropped, so a pasted line ending in a newline submits the text before it. Several letters in one terminal read reach huh as one key. Keys typed before a question appears wait in the terminal. The questions, their order, choices and accepted answers are the same.

## Help and parser messages

Commands, flags and help come from cobra. Help layout and parser error wording differ, and Go prints no "Did you mean" suggestion. Accepted and rejected arguments, parsed values and exit codes are the same, and parser errors never echo a control byte.

## Status page and PDF bytes

The status page formats sizes with `go-humanize`. The recovery kit is written by Go's own PDF writer: its extracted text, line breaks and Info fields match, its compressed streams don't.
