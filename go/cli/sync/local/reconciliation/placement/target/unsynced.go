package target

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/output"
	sf "github.com/notsuhas/envden/go/cli/state/files"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/placement"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SyncedContent(context *sm.Context, store string) []byte {
	encoded, err := sf.OptionalRead(f.BasePath(context.Adapters.Home, store) + ".entry")
	if err != nil || encoded == nil {
		return nil
	}
	raw, err := client.Binary(*encoded)
	if err != nil {
		return nil
	}
	entry, err := b.Decode(m.FileEntryCodec, raw)
	if err != nil {
		return nil
	}
	value, _ := remote.EntryContent(context, entry)

	return value
}

func KeepUnsynced(context *sm.Context, path string, target *state.Link, synced []byte) error {
	value, err := f.ReadBytes(path)
	if err != nil {
		return err
	}
	if value == nil || f.Same(value, synced) {
		return nil
	}
	saved, err := local.Backup(context.Adapters.Home, path, context.Options.Now())
	if err != nil || saved == "" {
		return err
	}
	shown := path
	if target != nil {
		shown = placement.CheckoutPath(context.Options.Cwd, target.Root, target.Path)
	}
	context.Report(output.SanitizeTerminal("Kept your previous " + shown + " at " + saved))

	return nil
}
