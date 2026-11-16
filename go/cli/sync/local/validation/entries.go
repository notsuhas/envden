package validation

import (
	"os"
	"path/filepath"

	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func CollisionEntries(context *syncmodel.Context, repos map[string]bool) (map[string]bool, error) {
	collisions := map[string]bool{}
	store := filepath.Join(context.Adapters.Home, "store")
	if err := os.MkdirAll(store, 0700); err != nil {
		return nil, err
	}

	insensitive, err := context.Adapters.Repo.CaseInsensitive(store, false)
	if err != nil {
		return nil, err
	}

	entries, err := remote.ReadableEntries(context)
	if err != nil {
		return nil, err
	}

	for repoID := range repos {
		cases := insensitive

		for _, root := range context.State.Approved {
			if syncmodel.Alias(context.State, root.RepoID) != repoID {
				continue
			}

			v, err := context.Adapters.Repo.CaseInsensitive(root.Root, false)
			if err != nil {
				return nil, err
			}

			cases = cases || v
		}

		paths, ids := []string{}, []string{}

		for _, entry := range entries {
			name, err := remote.EntryName(context, entry)
			if err != nil {
				return nil, err
			}

			if name.RepoId == repoID {
				paths = append(paths, name.Path)
				ids = append(ids, encoding.Base32(entry.FileId))
			}
		}

		for index := range PathCollisions(paths, cases) {
			collisions[ids[index]] = true
		}
	}

	return collisions, nil
}
