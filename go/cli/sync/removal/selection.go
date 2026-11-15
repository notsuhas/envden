package removal

import (
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	st "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	pf "github.com/notsuhas/envden/go/core/protocol/files"
)

type Selection struct {
	Targets []st.Link
	Skipped []string
	Blocked bool
}

func RemovalTargets(a contracts.Adapters, state *st.State, store string, links sm.Links) (Selection, error) {
	result := Selection{Targets: []st.Link{}, Skipped: []string{}}
	for _, target := range state.Links {
		if target.Store != store || target.LocalOnly {
			continue
		}
		approved := false
		if links.ApprovedCheckout != nil {
			checkout, err := links.ApprovedCheckout(a.Repo, state, target.Root)
			if err != nil {
				return result, err
			}
			approved = checkout != nil
		}
		if approved {
			result.Targets = append(result.Targets, target)
		} else {
			result.Skipped = append(result.Skipped, filepath.Join(target.Root, target.Path))
			if target.Mode == "link" {
				result.Blocked = true
			}
		}
	}

	return result, nil
}

func RemovalEntry(a contracts.Adapters, state *st.State, root, path string) (*string, error) {
	key, err := a.Keychain.Get("envden/"+a.Home+"/id-key", false)
	if err != nil || key == nil {
		return nil, err
	}
	for _, checkout := range state.Approved {
		if checkout.Root != root {
			continue
		}
		id, err := pf.FileID(key, sm.Alias(state, checkout.RepoID), path)
		if err != nil {
			return nil, err
		}
		applied, err := local.AppliedFiles(a.Home)
		if err != nil {
			return nil, err
		}
		if value, ok := applied.Get(b.Base32(id)).(string); ok {
			return &value, nil
		}
		break
	}

	return nil, nil
}
