package view

import (
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/state/records"
	"github.com/notsuhas/envden/go/cli/sync/local/conflicts"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/merge"
)

func ConflictViews(home string) ([]ConflictView, error) {
	result := []ConflictView{}
	doc, err := records.ReadSyncRecord(filepath.Join(home, "state", "conflicts.json"), conflicts.DecodeDocument)
	if err != nil || doc == nil {
		return result, err
	}

	for _, record := range doc.Records {
		var mine, server []byte
		if !record.MineDeleted {
			mine, err = files.ReadBytes(record.Mine)
			if err != nil {
				return nil, err
			}
		}

		if !record.Deleted {
			server, err = files.ReadBytes(record.Server)
			if err != nil {
				return nil, err
			}
		}

		if mine == nil {
			mine = []byte{}
		}

		if server == nil {
			server = []byte{}
		}

		roots := []string{}
		for _, t := range record.Targets {
			roots = append(roots, t.Root)
		}

		result = append(result, ConflictView{record.File, record.Path, roots, KeyChangesView(merge.DiffEnvKeys(server, mine)), record.Deleted, record.MineDeleted})
	}

	return result, nil
}
