package agent

import (
	"github.com/notsuhas/envden/go/cli/host"
	"github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const skill = `---
name: envden
description: Sync this checkout's env files with envden.
---
Commands and flags: https://envden.theclau.de/docs/cli
Syncing and conflicts: https://envden.theclau.de/docs/push-pull-merge
Agent rules: https://envden.theclau.de/docs/agents

Run envden status --json before syncing. Run envden push --yes or envden pull --yes only when the user asks.
Never read or print env values.
Ask the user to enter the master password, pairing codes and recovery secrets, and to approve checkouts, in their own terminal.
Run envden rm only when the user asks to delete that env file everywhere.
Never resolve conflicts without the user's approval. If envden config agent-merge is on, you may help edit a conflict file.
Use envden update --check freely; ask before running envden update.
`

func InstallAgent(userHome string, now func() int64) error {
	target := filepath.Join(userHome, ".agents", "skills", "envden")
	link := filepath.Join(userHome, ".claude", "skills", "envden")
	file := filepath.Join(target, "SKILL.md")
	raw, e := os.ReadFile(file)
	if e != nil && !os.IsNotExist(e) {
		return e
	}
	if e == nil && !regexp.MustCompile(`(?m)^name: envden$`).MatchString(strings.SplitN(string(raw), "\n---", 2)[0]) {
		return errors.New(errors.Conflict, "~/.agents/skills/envden already holds a different skill")
	}
	if e = host.WriteThrough(file, []byte(skill), now); e != nil {
		return e
	}
	if e = os.MkdirAll(filepath.Dir(link), 0777); e != nil {
		return e
	}
	_, e = os.Lstat(link)
	if os.IsNotExist(e) {
		return os.Symlink(target, link)
	}
	if e != nil {
		return e
	}
	real, e := filepath.EvalSymlinks(link)
	dest, d := filepath.EvalSymlinks(target)
	if e != nil || d != nil || real != dest {
		return errors.New(errors.Conflict, "~/.claude/skills/envden already holds a different skill")
	}
	return nil
}
