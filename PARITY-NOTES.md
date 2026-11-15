## process: platform error text

Scenario: A trusted executable passes validation but fails to start, or a filesystem permission operation fails.
TS behaviour: Bun/Node exposes its platform error message.
Possible improvement: Normalize operating-system error messages across runtimes.
Why: Go returns its native OS error text; exact Bun/Node wording is not reproduced. Typed Envden errors retain the reference text and codes.
Bug-in-TS: no
