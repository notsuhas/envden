## process: platform error text

Scenario: A trusted executable passes validation but fails to start, or a filesystem permission operation fails.
TS behaviour: Bun/Node exposes its platform error message.
Possible improvement: Normalize operating-system error messages across runtimes.
Why: Go returns its native OS error text; exact Bun/Node wording is not reproduced. Typed Envden errors retain the reference text and codes.
Bug-in-TS: no

## date-fns: fractional mean-year truncation

Scenario: `milliseconds({ years: 1 })` or `milliseconds({ months: 3 })`.
TS behaviour: returns 31556951999 or 7889237999 milliseconds, preserving floating-point truncation. The Go port matches.
Possible improvement: round these durations to the nearest millisecond.
Why: multiplication of the mean-year constant lands just below an integer.
Bug-in-TS: yes
