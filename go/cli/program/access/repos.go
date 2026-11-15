package access

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/vault/join/material"
	"github.com/notsuhas/envden/go/core/protocol/files"
)

func vaultRepos(a contracts.Adapters, state *model.State) (map[string]bool, error) {
	repos := map[string]bool{}
	if state.Files == "" || state.VaultID == "" {
		return repos, nil
	}

	material, err := material.CheckpointMaterial(a, state)
	if err != nil {
		return nil, err
	}

	for _, entry := range material.Checkpoint.Files.Entries {
		key := material.Keys[entry.Epoch]
		if key == nil {
			continue
		}

		name, err := files.OpenFileName(entry.Name, key, material.Checkpoint.IdKey, files.FileContext{VaultId: material.Checkpoint.Header.Body.VaultId, FileId: entry.FileId, Epoch: entry.Epoch, Version: entry.Version})
		if err != nil {
			return nil, err
		}

		repos[name.RepoId] = true
	}

	return repos, nil
}
