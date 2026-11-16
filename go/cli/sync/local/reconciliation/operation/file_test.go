package operation

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	fakeplace "github.com/notsuhas/envden/go/testing/placement"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
)

func TestInterruptedCopyPlacement(t *testing.T) {
	for _, edit := range []bool{false, true} {
		t.Run(map[bool]string{false: "resume", true: "preserve edit"}[edit], func(t *testing.T) {
			home, root := t.TempDir(), t.TempDir()
			store := filepath.Join(home, "store", ".env")
			destination := filepath.Join(root, ".env")
			clock := func() int64 { return 1700000000000 }
			if err := localfiles.WriteBytes(store, []byte("old"), clock); err != nil {
				t.Fatal(err)
			}
			if err := localfiles.WriteBytes(destination, []byte("old"), clock); err != nil {
				t.Fatal(err)
			}

			item := model.Link{Root: root, Path: ".env", Store: store, Mode: "copy"}
			fail := true
			placement := fakeplace.CreateFakePlacementAdapter(fakeplace.Operations{Mode: adapters.PlacementCopy,
				Inspect: func(source, path string) (adapters.PlacementState, error) {
					a, err := localfiles.ReadBytes(source)
					if err != nil {
						return "", err
					}

					v, err := localfiles.ReadBytes(path)
					if err != nil {
						return "", err
					}

					if localfiles.Same(a, v) {
						return adapters.PlacementLinked, nil
					}

					return adapters.PlacementDetached, nil
				},
				Place: func(source, path string, _ func(string) error, _ *string) error {
					if fail {
						fail = false

						return errors.New("injected copy failure")
					}

					value, err := localfiles.ReadBytes(source)
					if err != nil {
						return err
					}

					return localfiles.WriteBytes(path, value, clock)
				},
			})
			a := contracts.Adapters{Home: home, Now: clock, Repo: fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{EnsureIgnored: func(adapters.Checkout, string) error { return nil }}), Placement: func(adapters.PlacementMode, string) adapters.Placement { return placement }}
			header := manifests.ManifestHeader{VaultId: make([]byte, 32), Prev: make([]byte, 32), ListHead: make([]byte, 32), KeyringHash: make([]byte, 32), FilesHash: make([]byte, 32), EnvelopeHash: make([]byte, 32), Signer: make([]byte, 16)}
			sc := &syncmodel.Context{Context: context.Background(), Adapters: a, State: model.EmptyState("fixture"), Options: syncmodel.Options{Now: clock}, Checkpoint: chain.Checkpoint{Header: encoding.Signed[manifests.ManifestHeader]{Body: header, Signature: make([]byte, 64)}}, Links: syncmodel.Links{ApprovedCheckout: func(adapters.Repo, *model.State, string) (*adapters.Checkout, error) {
				return &adapters.Checkout{Root: root}, nil
			}}}
			sc.State.Links = []model.Link{item}
			if err := CommitFile(sc, []model.Link{item}, store, []byte("next"), []byte("server"), nil); err == nil {
				t.Fatal("failure not injected")
			}

			if edit {
				if err := localfiles.WriteBytes(destination, []byte("user edit"), clock); err != nil {
					t.Fatal(err)
				}
			}
			if err := ResumeFile(sc, store); err != nil {
				t.Fatal(err)
			}

			value, err := localfiles.ReadBytes(destination)
			want := "next"

			if edit {
				want = "user edit"
			}
			if err != nil || string(value) != want {
				t.Fatal(string(value), err)
			}

			if _, err := os.Stat(localfiles.BasePath(home, store) + ".pending"); !os.IsNotExist(err) {
				t.Fatal(err)
			}
		})
	}
}
