---
"@envden/cli": patch
---

Work with dotfiles setups where config paths are symlinks. Setup no longer fails when `~/.claude/skills` and `~/.agents/skills` are the same folder, and a skill or shell notice that can't be installed is now a warning. The agent skill, shell notice and login service write through symlinks to their dotfiles targets, checkout scans follow symlinked folders such as `~/Work` on another disk, and `ENVDEN_HOME` can be a symlink.
