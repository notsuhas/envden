package remote

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/store"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func PersistCheckpoint(context *sm.Context) error {
	hash, err := cr.ObjectHash(m.ManifestHeaderCodec, context.Checkpoint.Header, "manifest")
	if err != nil {
		return err
	}
	context.State.Checkpoint = client.Text(hash)
	raw, err := verifiedState(context)
	if err != nil {
		return err
	}
	context.State.VerifiedState = raw
	context.State.Touch("verifiedState")
	own, ok := context.Checkpoint.State.Devices[b.Base32(context.Identity.Record.Id)]
	if ok && own.Name != context.State.DeviceName {
		if err = identity.AdoptCommittedName(context.Adapters.Keychain, context.Adapters.Home, own); err != nil {
			return err
		}
		context.State.DeviceName = own.Name
	}
	context.State.Files = client.Text(m.FilesCodec.Write(context.Checkpoint.Files))
	context.State.Headers = []string{}
	for _, v := range context.Headers {
		context.State.Headers = append(context.State.Headers, client.Text(b.SignedCodec(m.ManifestHeaderCodec).Write(v)))
	}
	context.State.Entries = []string{}
	for _, v := range context.Entries {
		context.State.Entries = append(context.State.Entries, client.Text(b.SignedCodec(c.EntryCodec).Write(v)))
	}

	timing := context.Adapters.Timing
	timing.Now = context.Options.Now

	return store.SaveState(context.Context, context.Adapters.Home, context.State, timing)
}
