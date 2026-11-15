package checkout

import (
	"os"
	"path/filepath"
	"slices"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/records"
	"github.com/notsuhas/envden/go/cli/sync/local/conflicts"
	syncfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
)

func RemoveConflictTargets(home, root string, now func() int64) error {
	path := filepath.Join(home, "state", "conflicts.json")
	doc, err := records.ReadSyncRecord(path, conflicts.DecodeDocument)
	if err != nil || doc == nil {
		return err
	}

	changed := false
	for _, r := range doc.Records {
		for _, t := range r.Targets {
			if t.Root == root {
				changed = true
			}
		}
	}

	if !changed {
		return nil
	}

	retained := []conflictmodel.Record{}
	for _, r := range doc.Records {
		before := len(r.Targets)
		r.Targets = slices.DeleteFunc(r.Targets, func(t model.Link) bool { return t.Root == root })
		if len(r.Targets) == before {
			retained = append(retained, r)
			continue
		}

		if len(r.Targets) == 0 {
			continue
		}

		stored, err := syncfiles.ReadBytes(r.Store)
		if err != nil {
			return err
		}

		base, err := syncfiles.ReadBytes(r.Base)
		if err != nil {
			return err
		}

		divergent := !syncfiles.Same(stored, base)
		for _, t := range r.Targets {
			destination := filepath.Join(t.Root, t.Path)
			st, err := os.Lstat(destination)
			if err != nil || !st.Mode().IsRegular() {
				continue
			}

			content, err := syncfiles.ReadBytes(destination)
			if err != nil {
				return err
			}

			basePath := syncfiles.BasePath(home, r.Store)
			if t.Mode == "copy" {
				basePath = syncfiles.BasePath(home, r.Store, t.Root)
			}

			ancestor, err := syncfiles.ReadBytes(basePath)
			if err != nil {
				return err
			}

			if content != nil && !syncfiles.Same(content, stored) && !syncfiles.Same(content, ancestor) {
				divergent = true
			}
		}

		if divergent {
			retained = append(retained, r)
		}
	}

	raw, err := jsonvalue.Marshal(conflicts.Document{Model: "shared-store", Records: retained})
	if err != nil {
		return err
	}

	return files.AtomicWrite(path, raw, now)
}
