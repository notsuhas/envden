package checkouts

import (
	"context"
	"io"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

func TestUnattendedApproval(t *testing.T) {
	for _, approved := range []bool{false, true} {
		t.Run(map[bool]string{false: "requires consent", true: "retains approval"}[approved], func(t *testing.T) {
			home := t.TempDir()
			a := contracts.Adapters{Home: home, Timing: lock.Timing{Now: func() int64 { return 1800000000000 }}}
			s := model.EmptyState("laptop")
			if approved {
				s.Approved = []model.Checkout{{Root: "/repo"}}
			}

			linked := 0
			d := Dependencies{Find: func(*model.State) ([]Eligible, error) {
				return []Eligible{{Checkout: adapters.Checkout{Root: "/repo"}, Files: []string{".env"}}}, nil
			}, Link: func(context.Context, *model.State, adapters.Checkout) error { linked++; return nil }}
			err := Setup(context.Background(), a, s, false, nil, io.Discard, d)
			if !approved {
				if !errors.Is(err, errors.InvalidInput) || linked != 0 {
					t.Fatal(linked, err)
				}

				return
			}

			if err != nil || linked != 1 {
				t.Fatal(linked, err)
			}

			saved, err := store.LoadState(home)
			if err != nil || saved == nil || len(saved.Approved) != 1 {
				t.Fatal(saved, err)
			}
		})
	}
}
