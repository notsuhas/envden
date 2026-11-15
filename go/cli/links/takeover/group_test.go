package takeover

import (
	"github.com/notsuhas/envden/go/cli/links/model"
	"github.com/notsuhas/envden/go/cli/links/takeover/target"
	"github.com/notsuhas/envden/go/core/adapters"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGroupAndSiblingLinks(t *testing.T) {
	yes := true
	clone := adapters.Checkout{Root: "/home/main"}
	worktree := adapters.Checkout{Root: "/home/a", RegisteredWorktree: &yes}
	own := model.OwnLink{Checkout: clone, Path: ".env", Link: "../shared.env", Target: "/home/shared.env"}
	wt := own
	wt.Checkout = worktree
	groups := GroupOwnLinks([]model.OwnLink{wt, own})
	if len(groups) != 1 || groups[0].Links[0].Checkout.Root != clone.Root {
		t.Fatal(groups)
	}
	question := TakeoverQuestion(groups[0], "/home")
	if !strings.HasPrefix(question, "~/main/.env and 1 other link to ~/shared.env.") || !strings.Contains(question, "Each checkout") {
		t.Fatal(question)
	}
	own.Link = ".env.development"
	if !SiblingLink(own, []string{".env", ".env.development"}) {
		t.Fatal("sibling not recognized")
	}
	own.Link = "../shared.env"
	if SiblingLink(own, []string{".env"}) {
		t.Fatal("foreign link treated as sibling")
	}
}

func TestTargetRefusesDirectoriesAndMissingFiles(t *testing.T) {
	dir := t.TempDir()
	if target.RegularTarget(dir) || target.ReadTarget(dir) != nil {
		t.Fatal("directory accepted")
	}
	path := filepath.Join(dir, "missing")
	if target.RegularTarget(path) || target.ReadTarget(path) != nil {
		t.Fatal("missing accepted")
	}
	if err := os.WriteFile(path, []byte{}, 0600); err != nil {
		t.Fatal(err)
	}
	if !target.RegularTarget(path) || target.ReadTarget(path) == nil {
		t.Fatal("empty regular file rejected")
	}
}
