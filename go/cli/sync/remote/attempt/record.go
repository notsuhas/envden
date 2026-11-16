package attempt

import (
	"os"
	"path/filepath"
	"slices"
	"strconv"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/store"
	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/history"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	state "github.com/notsuhas/envden/go/cli/sync/remote/attempt/state"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SaveAttempt(context *syncmodel.Context, entries []manifests.FileEntry, header encoding.Signed[manifests.ManifestHeader], places []string) error {
	hash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, header, "manifest")
	if err != nil {
		return err
	}

	encoded := []string{}

	for _, entry := range entries {
		encoded = append(encoded, client.Text(manifests.FileEntryCodec.Write(entry)))
	}

	document, err := jsonvalue.Marshal(state.Attempt{Header: client.Text(hash), Sequence: strconv.FormatUint(header.Body.Seq, 10), Places: places, Entries: encoded})
	if err != nil {
		return err
	}

	return statefiles.AtomicWrite(filepath.Join(context.Adapters.Home, "state", "attempts", state.Receipt(string(document))), document, context.Options.Now)
}

func AcknowledgeAttempt(context *syncmodel.Context) error {
	attempts, err := state.ReadAttempts(context.Adapters, context.State.Links, context.Options.Now, context.Options.Report)
	if err != nil {
		return err
	}

	for _, attempt := range attempts {
		accepted := false

		for _, header := range context.Headers {
			hash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, header, "manifest")
			if err != nil {
				return err
			}

			if client.Text(hash) == attempt.Header {
				accepted = true
				break
			}
		}

		if accepted {
			if err := applyAttempt(context, attempt); err != nil {
				return err
			}
		}

		sequence, _ := strconv.ParseUint(attempt.Sequence, 10, 64)

		if accepted || context.Checkpoint.Header.Body.Seq >= sequence {
			if err := os.Remove(attempt.Path); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}

	return nil
}

func applyAttempt(context *syncmodel.Context, attempt state.Attempt) error {
	home := context.Adapters.Home
	now := context.Options.Now
	applied, err := local.AppliedFiles(home)
	if err != nil {
		return err
	}

	for _, value := range attempt.Entries {
		entry, err := operation.DecodeEntry(value)
		if err != nil {
			return err
		}

		name, err := remote.EntryName(context, entry)
		if err != nil {
			return err
		}

		path, err := store.StorePath(home, name.RepoId, name.Path)
		if err != nil {
			return err
		}

		content, err := remote.EntryContent(context, entry)
		if err != nil {
			return err
		}

		places := []string{localfiles.BasePath(home, path)}

		for _, link := range context.State.Links {
			if link.Store == path && link.Mode == "copy" {
				places = append(places, localfiles.BasePath(home, path, link.Root))
			}
		}

		for _, place := range attempt.Places {
			if slices.Contains(places, place) {
				if err := history.SaveBase(place, content, now); err != nil {
					return err
				}
			}
		}
		if err := statefiles.AtomicWrite(localfiles.BasePath(home, path)+".entry", []byte(value), now); err != nil {
			return err
		}

		applied.Set(encoding.Base32(entry.FileId), value)
		requested, err := operation.DeletionRequested(home, path, now)
		if err != nil {
			return err
		}

		if requested {
			if err = operation.RequestDeletion(home, path, content != nil, &value, nil, now); err != nil {
				return err
			}
		}
	}

	return local.SaveAppliedFiles(home, applied, now)
}
