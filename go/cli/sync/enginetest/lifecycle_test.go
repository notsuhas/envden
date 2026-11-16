package enginetest

import (
	"errors"
	"github.com/notsuhas/envden/go/core/adapters"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"testing"
)

func TestTombstonesRemoveLinks(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	f.remove(f.first, filepath.Join(f.checkout.Root, ".env"))
	f.push(f.first)
	f.second.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: f.second.Repo.CheckoutAt, CaseInsensitive: f.second.Repo.CaseInsensitive, EnsureIgnored: func(adapters.Checkout, string) error { return errors.New("tracked on branch") }})
	equal(t, f.pull(f.second).Conflicts, 0)
	equal(t, len(f.state(f.second).Links), 0)
}
func TestAdoptsUnjournaledStoreLink(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	s := f.state(f.second)
	s.Links = nil
	f.save(f.second, s)
	f.write(f.aStore, "TOKEN=changed\n")
	f.push(f.first)
	equal(t, f.pull(f.second).Conflicts, 0)
	equal(t, len(f.state(f.second).Links), 1)
}
func TestNoticeFailureDoesNotFailCommittedPush(t *testing.T) {
	f := newFixture(t)
	f.write(f.aStore, "TOKEN=changed\n")
	path := filepath.Join(f.first.Home, "state", "remote-notice.json")
	must(t, os.RemoveAll(path))
	must(t, os.MkdirAll(path, 0700))
	equal(t, f.push(f.first).Kind, "pushed")
}
