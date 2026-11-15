package files

import (
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
	f "github.com/notsuhas/envden/go/core/protocol/files"
	"path/filepath"
	"strings"
)

type Target struct {
	Root, Path, RepoID string
	Link               *model.Link
}
type Selection struct {
	Cwd  string
	File *string
	All  bool
}

func SelectionDirectory(o Selection) string {
	if o.File == nil {
		return o.Cwd
	}
	return filepath.Dir(resolve(o.Cwd, *o.File))
}

func HistoryTargets(state *model.State, repos map[string]bool, o Selection) ([]Target, error) {
	approved := []model.Checkout{}
	for _, c := range state.Approved {
		for _, alias := range state.Aliases {
			if alias.Key == c.RepoID {
				c.RepoID, _ = alias.Value.(string)
				break
			}
		}
		if repos[c.RepoID] {
			approved = append(approved, c)
		}
	}
	if o.File != nil {
		absolute := resolve(o.Cwd, *o.File)
		checkout := deepest(approved, absolute)
		if checkout == nil {
			return nil, errors.New(errors.NotFound, "File is not in an approved checkout")
		}
		rel, err := filepath.Rel(checkout.Root, absolute)
		if err != nil {
			return nil, err
		}
		path := filepath.ToSlash(rel)
		if err = f.ValidatePath(path); err != nil {
			return nil, errors.Wrap(errors.InvalidInput, "Name an env file inside the checkout", err)
		}
		t := Target{Root: checkout.Root, Path: path, RepoID: checkout.RepoID}
		for i := range state.Links {
			l := &state.Links[i]
			if l.Root == t.Root && l.Path == path {
				t.Link = l
				break
			}
		}
		return []Target{t}, nil
	}
	roots := approved
	if !o.All {
		roots = nil
		if inside := deepest(approved, o.Cwd); inside != nil {
			roots = []model.Checkout{*inside}
		}
	}
	targets := []Target{}
	for _, c := range roots {
		for i := range state.Links {
			l := &state.Links[i]
			if l.Root == c.Root && !l.LocalOnly {
				targets = append(targets, Target{l.Root, l.Path, c.RepoID, l})
			}
		}
	}
	return targets, nil
}

func resolve(cwd, path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	return filepath.Join(cwd, path)
}
func deepest(checkouts []model.Checkout, path string) *model.Checkout {
	var found *model.Checkout
	for _, c := range checkouts {
		rel, err := filepath.Rel(c.Root, path)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		if found == nil || len(c.Root) > len(found.Root) {
			copy := c
			found = &copy
		}
	}
	return found
}
