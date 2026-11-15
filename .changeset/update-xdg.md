---
"@envden/cli": patch
---

`envden update` keeps `XDG_CONFIG_HOME`, so Homebrew finds taps trusted with `brew trust` when that variable is set.
