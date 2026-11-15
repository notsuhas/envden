package recovery_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	historyfiles "github.com/notsuhas/envden/go/cli/history/files"
	"github.com/notsuhas/envden/go/cli/history/list"
	"github.com/notsuhas/envden/go/cli/history/restore"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
	contentcodecs "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
	"github.com/notsuhas/envden/go/testing/repo"
)

func TestEncryptedHistoryAndRestore(t *testing.T) {
	f := newFixture(t, false)
	root := t.TempDir()
	path := filepath.Join(root, ".env")
	checkout := adapters.Checkout{Root: root, RepoID: "example/repo", GitDir: filepath.Join(root, ".git")}
	f.a.Repo = repo.CreateFakeRepoAdapter(repo.Operations{CheckoutAt: func(string) (*adapters.Checkout, error) { return &checkout, nil }})
	c, err := shared.AdminContext(f.ctx, f.a, f.now, f.a.Fetcher)
	if err != nil {
		t.Fatal(err)
	}

	h, err := shared.CurrentHistory(f.ctx, c)
	if err != nil {
		t.Fatal(err)
	}

	material, err := shared.CurrentMaterial(f.ctx, c, h)
	if err != nil {
		t.Fatal(err)
	}

	id, err := protocolfiles.FileID(material.Ring.IdKey, checkout.RepoID, ".env")
	if err != nil {
		t.Fatal(err)
	}

	contents := []string{"TOKEN=first-secret\n", "TOKEN=first-secret\nDB_URL=second-secret\n", "TOKEN=third-secret\nDB_URL=second-secret\n"}
	for i, content := range contents {
		fc := protocolfiles.FileContext{VaultId: c.VaultID, Epoch: material.Ring.Epoch, FileId: id, Version: uint64(i + 1)}
		name, err := protocolfiles.SealFileName(contentcodecs.FileName{RepoId: checkout.RepoID, Path: ".env"}, material.Key, fc)
		if err != nil {
			t.Fatal(err)
		}

		box, err := protocolfiles.SealFile(contentcodecs.File{RepoId: checkout.RepoID, Path: ".env", Content: []byte(content)}, material.Key, fc)
		if err != nil {
			t.Fatal(err)
		}

		hash := crypto.H("blob", box)
		if err = shared.Send(f.ctx, c.Client, "/v1/blobs/"+client.Text(hash), "PUT", box); err != nil {
			t.Fatal(err)
		}

		swap, err := shared.AdminSwap(h, c.Identity, 1, f.now(), manifests.Swap{Files: &manifests.Files{Entries: []manifests.FileEntry{{FileId: id, Version: fc.Version, Epoch: fc.Epoch, State: 1, BlobHash: hash, Name: name}}}})
		if err != nil {
			t.Fatal(err)
		}

		if err = shared.CommitAdmin(f.ctx, c, swap); err != nil {
			t.Fatal(err)
		}

		h, err = shared.CurrentHistory(f.ctx, c)
		if err != nil {
			t.Fatal(err)
		}
	}

	local, err := store.LoadState(f.a.Home)
	if err != nil {
		t.Fatal(err)
	}

	local.Approved = []model.Checkout{{Root: root, GitDir: checkout.GitDir, RepoID: checkout.RepoID}}
	local.Links = []model.Link{{Root: root, Path: ".env", Store: path, Mode: "copy"}}
	if err = store.SaveState(f.ctx, f.a.Home, local, f.a.Timing); err != nil {
		t.Fatal(err)
	}

	if err = os.WriteFile(path, []byte(contents[2]), 0600); err != nil {
		t.Fatal(err)
	}

	history, err := list.FileHistory(f.ctx, f.a, list.Options{Selection: historyfiles.Selection{Cwd: root}, Now: f.now, Fetcher: f.a.Fetcher})
	if err != nil {
		t.Fatal(err)
	}

	if len(history.Files) != 1 || len(history.Files[0].Versions) != 3 || history.Files[0].Checkouts[0].Version == nil || *history.Files[0].Checkouts[0].Version != 3 {
		t.Fatal(history)
	}

	output := list.HistoryText(history, f.now(), "")
	for _, secret := range []string{"first-secret", "second-secret", "third-secret"} {
		if strings.Contains(output, secret) {
			t.Fatal("history leaked a value")
		}
	}

	result, err := restore.RestoreVersion(f.ctx, f.a, restore.Options{Cwd: root, File: ".env", Version: 1, Yes: true, Interactive: true, Now: f.now, Fetcher: f.a.Fetcher})
	if err != nil || result.Kind != "restored" || result.Backup == "" {
		t.Fatal(result, err)
	}

	current, err := os.ReadFile(path)
	if err != nil || string(current) != contents[0] {
		t.Fatal(string(current), err)
	}

	backup, err := os.ReadFile(result.Backup)
	if err != nil || string(backup) != contents[2] {
		t.Fatal("backup does not preserve local content", err)
	}

	unchanged, err := restore.RestoreVersion(f.ctx, f.a, restore.Options{Cwd: root, File: ".env", Version: 1, Yes: true, Interactive: true, Now: f.now, Fetcher: f.a.Fetcher})
	if err != nil || unchanged.Kind != "unchanged" {
		t.Fatal(unchanged, err)
	}

	after, err := shared.CurrentHistory(f.ctx, c)
	if err != nil || len(after.Headers) != len(h.Headers) {
		t.Fatal("restore published a change", err)
	}
}
