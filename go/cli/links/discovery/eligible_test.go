package discovery

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
	fake "github.com/notsuhas/envden/go/testing/repo"
	"sync"
	"testing"
)

func TestEligibleRetainsInputOrderWithConcurrentChecks(t *testing.T) {
	repos := []adapters.Checkout{}
	for i := 0; i < 20; i++ {
		repos = append(repos, adapters.Checkout{Root: fmt.Sprint(i), RepoID: fmt.Sprint(i)})
	}
	gate := make(chan struct{})
	var once sync.Once
	var mu sync.Mutex
	running, peak := 0, 0
	repo := fake.CreateFakeRepoAdapter(fake.Operations{EnvFiles: func(c adapters.Checkout, _ *adapters.EnvFileRules) ([]string, error) {
		mu.Lock()
		running++
		if running > peak {
			peak = running
		}
		if running == 8 {
			once.Do(func() { close(gate) })
		}
		mu.Unlock()
		<-gate
		mu.Lock()
		running--
		mu.Unlock()
		if c.Root == "3" {
			return []string{}, nil
		}
		return []string{".env"}, nil
	}})
	got, err := EligibleCheckouts(contracts.Adapters{Home: t.TempDir(), Repo: repo}, model.EmptyState("x"), repos, map[string]bool{})
	if err != nil {
		t.Fatal(err)
	}
	if peak != 8 || len(got) != 19 {
		t.Fatal(peak, len(got))
	}
	index := 0
	for i := range repos {
		if i == 3 {
			continue
		}
		if got[index].Checkout.Root != repos[i].Root {
			t.Fatal("order changed")
		}
		index++
	}
}
