package discovery

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/contracts"
	"sync"

	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

type Eligible struct {
	Checkout adapters.Checkout
	Files    []string
}

func EligibleCheckouts(a contracts.Adapters, state *model.State, repos []adapters.Checkout, storedRepos map[string]bool) ([]Eligible, error) {
	config, err := settings.ReadConfig(a.Home)
	if err != nil {
		return nil, err
	}
	var rules *adapters.EnvFileRules
	if config.EnvFiles != nil {
		raw, err := json.Marshal(config.EnvFiles)
		if err != nil {
			return nil, err
		}
		rules = &adapters.EnvFileRules{}
		if err := json.Unmarshal(raw, rules); err != nil {
			return nil, err
		}
	}
	listed := make([]Eligible, len(repos))
	errs := make([]error, len(repos))
	git := make(chan struct{}, 8)
	var group sync.WaitGroup
	for i, item := range repos {
		group.Add(1)
		go func() {
			defer group.Done()
			git <- struct{}{}
			files, err := a.Repo.EnvFiles(item, rules)
			<-git
			listed[i] = Eligible{item, files}
			errs[i] = err
		}()
	}
	group.Wait()
	result := []Eligible{}
	for i, item := range listed {
		if errs[i] != nil {
			return nil, errs[i]
		}
		if len(item.Files) > 0 || storedRepos[eligibleRepo(state, item.Checkout.RepoID)] {
			result = append(result, item)
		}
	}
	return result, nil
}

func eligibleRepo(state *model.State, id string) string {
	if value, ok := state.Aliases.Get(id).(string); ok {
		return value
	}
	return id
}
