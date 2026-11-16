package operation

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/journal"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/history"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/placement/target"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
)

func HeaderHash(context *syncmodel.Context) string {
	hash, _ := crypto.ObjectHash(manifests.ManifestHeaderCodec, context.Checkpoint.Header, "manifest")

	return client.Text(hash)
}

func ResumeFile(context *syncmodel.Context, store string) error {
	path := localfiles.BasePath(context.Adapters.Home, store) + ".pending"
	operation, err := ReadOperation(path, context.Options.Now, context.Options.Report)
	if err != nil || operation == nil {
		return err
	}

	next, server := decodedBytes(operation.Next), decodedBytes(operation.Server)
	current, err := OperationHashes(context, store, operation.Targets)
	if err != nil {
		return err
	}

	for i := range operation.Written {
		operation.Written[i] = operation.Written[i] || sameHash(current[i], ContentHash(next))
	}
	if err = recoverPlaces(context, store, operation, next); err != nil {
		return err
	}

	if operation.Header != HeaderHash(context) || !CanResume(operation.Before, current, ContentHash(next), operation.Written) {
		return localfiles.WriteBytes(path, nil, context.Options.Now)
	}
	if err = finishFile(context, store, operation.Targets, next, server, operation.Entry, operation); err != nil {
		return err
	}

	if operation.Entry != nil {
		if err = local.MarkAppliedEntry(context.Adapters.Home, *operation.Entry, "", context.Options.Now, context.AtomicWrite); err != nil {
			return err
		}
	}

	return localfiles.WriteBytes(path, nil, context.Options.Now)
}

func CommitFile(context *syncmodel.Context, targets []state.Link, store string, next, server []byte, entry *string) error {
	before, err := OperationHashes(context, store, targets)
	if err != nil {
		return err
	}

	identical := true

	for _, hash := range before {
		identical = identical && sameHash(hash, ContentHash(next))
	}

	if identical {
		for _, target := range targets {
			if target.Mode == "copy" {
				value, err := localfiles.ReadBytes(localfiles.BasePath(context.Adapters.Home, store, target.Root))
				if err != nil {
					return err
				}

				identical = identical && localfiles.Same(value, next)
			}
		}
	}

	if identical {
		return finishFile(context, store, targets, next, server, entry, nil)
	}

	written := make([]bool, len(before))

	for i, hash := range before {
		written[i] = sameHash(hash, ContentHash(next))
	}

	operation := Operation{Targets: targets, Before: before, Written: written, Entry: entry, Header: HeaderHash(context), Next: encodedBytes(next), Server: encodedBytes(server)}
	if err = saveOperation(context, store, &operation); err != nil {
		return err
	}

	return ResumeFile(context, store)
}

func finishFile(context *syncmodel.Context, store string, targets []state.Link, next, server []byte, entry *string, operation *Operation) error {
	home := context.Adapters.Home
	now := context.Options.Now
	synced := target.SyncedContent(context, store)
	old, err := localfiles.ReadBytes(store)
	if err != nil {
		return err
	}

	if !localfiles.Same(old, next) {
		var first *state.Link

		if len(targets) > 0 {
			first = &targets[0]
		}
		if err = target.KeepUnsynced(context, store, first, synced); err != nil {
			return err
		}

		if next != nil && context.Options.AtomicWrite != nil {
			err = context.AtomicWrite(store, next)
		} else {
			err = localfiles.WriteBytes(store, next, now)
		}
		if err != nil {
			return err
		}
	} else if next != nil {
		recorded, err := localfiles.ReadBytes(localfiles.BasePath(home, store))
		if err != nil {
			return err
		}

		if !localfiles.Same(recorded, next) {
			if err = context.AtomicWrite(store, next); err != nil {
				return err
			}
		}
	}

	if operation != nil {
		if err = markWritten(context, store, operation, 0); err != nil {
			return err
		}
	}

	if entry != nil {
		if err = context.AtomicWrite(localfiles.BasePath(home, store)+".entry", []byte(*entry)); err != nil {
			return err
		}
	}
	if err = history.SaveBase(localfiles.BasePath(home, store), next, now, context.AtomicWrite); err != nil {
		return err
	}

	deleting, err := DeletionRequested(home, store, now)
	if err != nil {
		return err
	}

	for i, item := range targets {
		placed, err := target.PlaceFileTarget(context, item, next, server != nil || deleting, synced)
		if err != nil {
			return err
		}

		if !placed {
			continue
		}

		if operation != nil {
			if err = markWritten(context, store, operation, i+1); err != nil {
				return err
			}
		}

		if item.Mode == "copy" {
			if err = history.SaveBase(localfiles.BasePath(home, store, item.Root), next, now, context.AtomicWrite); err != nil {
				return err
			}
		}
	}

	return journal.JournalPlacement(home, context.State, now)
}
