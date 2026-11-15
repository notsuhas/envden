package removal

import (
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	cm "github.com/notsuhas/envden/go/cli/model/conflicts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/core/adapters"
)

func PreserveRemoval(a contracts.Adapters, store string, targets []state.Link, records []cm.Record, now int64, report func(string)) ([]cm.Backup, error) {
	preserved := []cm.Backup{}
	paths := []string{store}
	for _, target := range targets {
		if target.Mode == "copy" {
			paths = append(paths, filepath.Join(target.Root, target.Path))
		}
	}
	for _, record := range records {
		if record.Store == store {
			paths = append(paths, record.File, record.Mine, record.Server, record.Remote)
			paths = append(paths, record.Alternatives...)
		}
	}
	for _, target := range targets {
		if target.Mode != "link" {
			continue
		}
		destination := filepath.Join(target.Root, target.Path)
		status, err := a.Placement(adapters.PlacementLink, target.Root).Inspect(store, destination)
		if err != nil {
			return nil, err
		}
		if status == "detached" {
			paths = append(paths, destination)
		}
	}
	for _, source := range paths {
		saved, err := local.Backup(a.Home, source, now)
		if err != nil {
			return nil, err
		}
		if saved != "" {
			preserved = append(preserved, cm.Backup{Source: source, Path: saved})
			if report != nil {
				report("Saved " + source + ": " + saved)
			}
		}
	}

	return preserved, nil
}
