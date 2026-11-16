package sync

import (
	"path/filepath"

	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/merge"
)

func SelectConflicts(records []conflictmodel.Record, options ResolveOptions) []conflictmodel.Record {
	scoped := []conflictmodel.Record{}
	repo := ""

	if options.Repo != "" {
		repo, _ = filepath.Abs(options.Repo)
	}

	for _, item := range records {
		include := repo == ""

		for _, target := range item.Targets {
			include = include || target.Root == repo
		}

		if include {
			scoped = append(scoped, item)
		}
	}

	if options.File == "" {
		return scoped
	}

	absolute, _ := filepath.Abs(options.File)
	placed := []conflictmodel.Record{}
	named := []conflictmodel.Record{}

	for _, item := range scoped {
		match := item.File == options.File

		for _, target := range item.Targets {
			match = match || absolute == filepath.Join(target.Root, item.Path)
		}

		if match {
			placed = append(placed, item)
		}

		if item.Path == options.File {
			named = append(named, item)
		}
	}

	if len(placed) > 0 {
		return placed
	}

	return named
}

func ResolutionBytes(choice string, record conflictmodel.Record, server []byte) ([]byte, error) {
	if choice == "take-server" {
		if record.Entry == nil {
			return nil, envdenerrors.New(envdenerrors.InvalidInput, "No server entry; keep mine or edit the local conflict file")
		}

		if record.Deleted {
			return nil, nil
		}

		return requireContent(server)
	}

	if choice == "edit" {
		edited, err := localfiles.ReadBytes(record.File)
		if err != nil {
			return nil, err
		}

		if edited == nil && !record.MineDeleted {
			return nil, envdenerrors.New(envdenerrors.InvalidInput, "Conflict file is missing; choose a recorded deletion side explicitly")
		}

		if edited != nil && merge.HasConflictMarkers(edited) {
			return nil, envdenerrors.New(envdenerrors.InvalidInput, "Conflict markers are still in "+record.File+". Edit it, or pass --keep-mine or --take-server")
		}

		return edited, nil
	}

	if record.MineDeleted {
		return nil, nil
	}

	value, err := localfiles.ReadBytes(record.Mine)
	if err != nil {
		return nil, err
	}

	return requireContent(value)
}

func requireContent(value []byte) ([]byte, error) {
	if value == nil {
		return nil, envdenerrors.New(envdenerrors.InvalidInput, "Recorded conflict content is missing")
	}

	return value, nil
}
