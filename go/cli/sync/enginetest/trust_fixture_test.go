package enginetest

import (
	"os"
	"path/filepath"
	"strings"

	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
)

func seedTrust(f *fixture, scenario string, s *state.State, target state.Link, path, edited string) bool {
	t := f.t

	switch {
	case scenario == "untracked-applied":
		s.Links = nil
		f.save(f.second, s)
		f.write(target.Store, edited)
		f.write(path, original)
		equal(t, f.pull(f.second).Conflicts, 0)
		equal(t, f.read(target.Store), edited)
		equal(t, f.read(path), edited)
		return true
	case scenario == "unapproved-deletion":
		f.remove(f.first, filepath.Join(f.checkout.Root, ".env"))
		f.push(f.first)
		f.write(path, edited)
	case strings.HasPrefix(scenario, "untracked"):
		s.Links = nil
		f.save(f.second, s)
		must(t, os.Remove(path))
		f.write(path, edited)
	case scenario == "different-base":
		f.write(files.BasePath(f.second.Home, target.Store, target.Root), "TOKEN=older\n")
		f.write(path, edited)
	case scenario == "missing-base":
		must(t, os.Remove(files.BasePath(f.second.Home, target.Store, target.Root)))
		f.write(path, edited)
	case scenario == "missing-copy":
		must(t, os.Remove(path))
		f.push(f.second)
		equal(t, f.read(target.Store), original)
		equal(t, f.read(path), original)
		return true
	case scenario == "merge-retry":
		f.write(f.aStore, "TOKEN=local-test-value\nB=remote\n")
		f.push(f.first)
		f.write(path, "TOKEN=local-test-value\nA=local\n")
	default:
		if scenario == "deletion-side" {
			f.remove(f.second, path)
			f.write(f.aStore, "TOKEN=remote\n")
			f.push(f.first)
		}
		f.write(path, edited)
		if scenario == "deletion-side" {
			must(t, files.WriteBytes(target.Store, nil, clock))
		} else {
			f.write(target.Store, "TOKEN=store-edit\n")
		}
	}

	return false
}
