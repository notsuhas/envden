package reconciliation

import (
	"github.com/notsuhas/envden/go/cli/client"
	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/content"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Result struct{ Changed, Conflicts int }

func ReconcileFile(context *syncmodel.Context, targets []state.Link, store string, entry *manifests.FileEntry, repairs map[string]bool, choose func(string) (string, error)) (Result, error) {
	if err := operation.ResumeFile(context, store); err != nil {
		return Result{}, err
	}

	snapshot, err := operation.ReadFileState(context, targets, store, entry)
	if err != nil {
		return Result{}, err
	}

	decision, repair, detached := decideFile(snapshot, entry, repairs, choose != nil)
	writable := decision.Action.Kind == "write" && localfiles.Same(snapshot.Stored, snapshot.Server)

	for _, item := range snapshot.Snapshots {
		writable = writable && (item.Bytes == nil || localfiles.Same(item.Bytes, snapshot.Server))
	}

	blocked, err := operation.BlocksFile(context.Adapters.Home, store, writable, context.Options.Now)
	if err != nil {
		return Result{}, err
	}

	changed := 0

	if snapshot.Restored {
		changed = 1
	}

	if blocked {
		return Result{changed, 1}, nil
	}

	chooser := choose

	if chooser == nil && detached && context.Options.Interactive != nil && *context.Options.Interactive {
		chooser = context.Options.Choose
	}

	resolution := decision.Action

	if decision.Local.Kind == "conflict" {
		resolution = Action{Kind: "conflict"}

		if chooser != nil && !context.Options.NonInteractive() {
			choice, err := chooser(targets[0].Path)
			if err != nil {
				return Result{}, err
			}

			if choice == "keep-mine" {
				resolution = Action{Kind: "write", Next: decision.Mine}
			} else if choice == "take-server" && decision.Theirs.Kind != "absent" {
				resolution = Action{Kind: "write", Next: decision.Theirs.Bytes}
			}
		}
	} else if resolution.Kind != "write" {
		resolution, err = ResolveContent(context.Options, targets[0].Path, decision.Mine, snapshot.Server, snapshot.Previous, chooser, snapshot.Server)
		if err != nil {
			return Result{}, err
		}
	}

	if repair || decision.Local.Kind != "conflict" && decision.Action.Kind == "conflict" {
		resolution = Action{Kind: "conflict"}
	}

	var encoded *string

	if entry != nil {
		value := client.Text(manifests.FileEntryCodec.Write(*entry))
		encoded = &value
	}

	if resolution.Kind != "write" {
		first := targets[0]
		variants := [][]byte{snapshot.Stored, snapshot.Server}

		for _, item := range snapshot.Snapshots {
			variants = append(variants, item.Bytes)
		}

		record := conflictmodel.Record{Root: first.Root, Path: first.Path, Store: first.Store, Mode: first.Mode, OriginalLink: first.OriginalLink, LocalOnly: first.LocalOnly, Base: snapshot.Base, Entry: encoded, Targets: targets}
		if err = local.RecordConflict(context, record, decision.Mine, decision.Theirs, snapshot.Previous, variants); err != nil {
			return Result{}, err
		}

		if repair {
			if err = remote.ConsumeRepair(context.Adapters.Home, encoding.Base32(entry.FileId), context.Options.Now); err != nil {
				return Result{}, err
			}
		}

		return Result{changed, 1}, nil
	}

	if !localfiles.Same(snapshot.Stored, resolution.Next) {
		changed = 1
	}

	for _, item := range snapshot.Snapshots {
		if !localfiles.Same(item.Bytes, resolution.Next) {
			changed = 1
		}
	}

	err = operation.CommitFile(context, targets, store, resolution.Next, snapshot.Server, encoded)

	return Result{changed, 0}, err
}

func decideFile(snapshot operation.FileState, entry *manifests.FileEntry, repairs map[string]bool, choosing bool) (FileDecision, bool, bool) {
	repair := entry != nil && repairs[encoding.Base32(entry.FileId)]
	detached, tracked := false, false
	copies := []content.Copy{}

	for _, item := range snapshot.Snapshots {
		detached = detached || item.Detached
		tracked = tracked || item.Tracked

		if !item.UseStore {
			copies = append(copies, item.Copy)
		}
	}

	applied := entry != nil && snapshot.Encoded != nil && *snapshot.Encoded == client.Text(manifests.FileEntryCodec.Write(*entry))
	input := FileInput{ContentInput: ContentInput{Previous: snapshot.Previous, Recorded: snapshot.Recorded, Reappeared: snapshot.Reappeared, Server: snapshot.Server, Repair: repair, Detached: detached, Choosing: choosing || snapshot.DeletionInvalid, Applied: applied, Tombstone: entry != nil && (entry.State == 2 || entry.State == 4)}, Store: snapshot.Stored, StoreBeforeRestore: snapshot.StoreBeforeRestore, Copies: copies, Tracked: tracked, Published: entry != nil, Deleting: snapshot.Deleting}
	decision := DeriveFileDecision(input)

	if snapshot.DeletionInvalid || snapshot.Corrupt {
		decision.Action = Action{Kind: "conflict"}
	}

	return decision, repair, detached
}
