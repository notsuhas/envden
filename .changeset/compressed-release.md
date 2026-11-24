---
"@envden/cli": patch
---

Release downloads are now `.tar.gz` archives, about 2.5x smaller (26 MB instead of 67 MB on Apple silicon). The install script, Homebrew and `envden update` all unpack them. `envden update` on 0.3.8 or older can't find the new download; rerun the install script once instead.
