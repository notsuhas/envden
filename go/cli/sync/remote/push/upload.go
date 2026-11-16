package push

import (
	"bytes"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	"github.com/notsuhas/envden/go/cli/sync/local/validation"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/adapters"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

type change struct {
	Base  string
	Bytes []byte
}

func uploadLink(context *syncmodel.Context, repos map[string]bool, link model.Link, files *manifests.Files, changed map[string]change, order *[]string, seen map[string][]byte) error {
	if link.LocalOnly || context.SkippedRoots[link.Root] {
		return nil
	}

	repoID := ""

	for _, approved := range context.State.Approved {
		if approved.Root == link.Root {
			repoID = syncmodel.Alias(context.State, approved.RepoID)
			break
		}
	}

	if repoID == "" || !repos[repoID] {
		return nil
	}

	id, err := protocolfiles.FileID(context.Checkpoint.IdKey, repoID, link.Path)
	if err != nil {
		return err
	}

	key := encoding.Base32(id)
	root := ""

	if link.Mode == "copy" {
		root = link.Root
	}

	base := localfiles.BasePath(context.Adapters.Home, link.Store, root)
	status, err := context.Adapters.Placement(adapters.PlacementMode(link.Mode), link.Root).Inspect(link.Store, filepath.Join(link.Root, link.Path))
	if err != nil {
		return err
	}

	if status == "detached" && link.Mode == "link" {
		return envdenerrors.New(envdenerrors.Conflict, "Detached checkout; resolve local content before pushing")
	}

	value, err := localfiles.ReadBytes(link.Store)
	if err != nil {
		return err
	}

	if notice := validation.FileSizeNotice(link.Path, value); notice != "" {
		context.Report(notice)

		return nil
	}

	var previous *manifests.FileEntry

	for _, entry := range context.Checkpoint.Files.Entries {
		if bytes.Equal(entry.FileId, id) {
			previous = &entry
			break
		}
	}

	requested, err := operation.DeletionRequested(context.Adapters.Home, link.Store, context.Options.Now)
	if err != nil {
		return err
	}

	if value == nil && (previous == nil || !requested) {
		return nil
	}

	var baseline []byte

	if previous != nil {
		baseline, err = remote.EntryContent(context, *previous)
		if err != nil {
			return err
		}
	}

	if localfiles.Same(value, baseline) && (previous != nil || !requested) {
		return nil
	}

	if _, ok := changed[base]; !ok {
		*order = append(*order, base)
	}

	if _, ok := seen[key]; ok {
		changed[base] = change{base, value}

		return nil
	}

	seen[key] = value
	next, err := remote.SealUpload(context, repoID, link.Path, id, previous, value)
	if err != nil {
		return err
	}

	index := -1

	for i, entry := range files.Entries {
		if bytes.Equal(entry.FileId, id) {
			index = i
			break
		}
	}

	if index < 0 {
		files.Entries = append(files.Entries, next)
	} else {
		files.Entries[index] = next
	}

	changed[base] = change{base, value}

	return nil
}
