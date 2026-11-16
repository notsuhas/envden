package operation

import (
	"path/filepath"
	"slices"

	"github.com/notsuhas/envden/go/cli/client"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/records"
	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/history"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type FileState struct {
	Base                                                     string
	Encoded                                                  *string
	Previous, Recorded, Server, Stored, StoreBeforeRestore   []byte
	Snapshots                                                []history.Snapshot
	Corrupt, Reappeared, Restored, Deleting, DeletionInvalid bool
}

func ReadFileState(context *syncmodel.Context, targets []state.Link, store string, entry *manifests.FileEntry) (FileState, error) {
	home := context.Adapters.Home
	now := context.Options.Now
	base := localfiles.BasePath(home, store)
	result := FileState{Base: base}
	ancestor, err := records.RecoverSyncRecord(base+".entry", base+".corrupt", func(saved string) (string, error) { _, err := DecodeEntry(saved); return saved, err }, now(), context.Options.Report)
	if err != nil {
		return result, err
	}

	if _, err = DeletionRequested(home, store, now); err != nil {
		return result, err
	}

	marker, err := statefiles.OptionalRead(base + ".corrupt")
	if err != nil {
		return result, err
	}

	result.Corrupt = marker != nil

	if !result.Corrupt {
		result.Encoded = ancestor

		if ancestor == nil && entry != nil {
			applied, err := local.AppliedFiles(home)
			if err != nil {
				return result, err
			}

			if value, ok := applied.Get(encoding.Base32(entry.FileId)).(string); ok {
				result.Encoded = &value
			}
		}
	}

	if result.Encoded != nil {
		prior, err := DecodeEntry(*result.Encoded)
		if err != nil {
			return result, err
		}

		result.Previous, err = remote.EntryContent(context, prior)
		if err != nil {
			return result, err
		}
	}

	if entry != nil {
		result.Server, err = remote.EntryContent(context, *entry)
		if err != nil {
			return result, err
		}
	}

	var reappeared []byte

	if !result.Corrupt {
		intent, err := ReadDeletion(home, store, now)
		if err != nil {
			return result, err
		}

		if intent != nil {
			paths := []string{store}

			for _, target := range targets {
				path := filepath.Join(target.Root, target.Path)

				if slices.Contains(intent.Targets, path) {
					paths = append(paths, path)
				}
			}

			for _, path := range paths {
				value, err := localfiles.ReadBytes(path)
				if err != nil {
					return result, err
				}

				if value == nil {
					continue
				}
				if err = RequestDeletion(home, store, false, nil, nil, now); err != nil {
					return result, err
				}

				context.Report("Cancelled removal; restored env file: " + path)
				reappeared = value
				result.Reappeared = true
				break
			}
		}
	}

	before, err := localfiles.ReadBytes(store)
	if err != nil {
		return result, err
	}

	result.StoreBeforeRestore = before

	if before == nil && reappeared != nil {
		result.Stored = reappeared
		result.StoreBeforeRestore = reappeared
	} else {
		if entry != nil && (entry.State == 2 || entry.State == 4) {
			err = RequestDeletion(home, store, false, nil, nil, now)
		} else {
			result.Deleting, err = DeletionRequested(home, store, now)
		}
		if err != nil {
			return result, err
		}

		result.Restored = before == nil && result.Server != nil && !result.Deleting && !result.Corrupt
		result.Stored = before

		if result.Restored {
			if err = localfiles.WriteBytes(store, result.Server, now); err != nil {
				return result, err
			}

			result.Stored = result.Server
		}
	}

	for _, target := range targets {
		snapshot, err := history.FileSnapshot(context, target, result.Stored, result.Previous)
		if err != nil {
			return result, err
		}

		result.Snapshots = append(result.Snapshots, snapshot)
	}

	intent, err := ReadDeletion(home, store, now)
	if err != nil {
		return result, err
	}

	if result.Deleting && entry != nil {
		result.DeletionInvalid = intent == nil || intent.Entry != client.Text(manifests.FileEntryCodec.Write(*entry))
	}

	result.Recorded, err = localfiles.ReadBytes(base)

	return result, err
}
