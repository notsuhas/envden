package remote

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/store"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func PersistCheckpoint(context *syncmodel.Context) error {
	hash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, context.Checkpoint.Header, "manifest")
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
	own, ok := context.Checkpoint.State.Devices[encoding.Base32(context.Identity.Record.Id)]

	if ok && own.Name != context.State.DeviceName {
		if err = identity.AdoptCommittedName(context.Adapters.Keychain, context.Adapters.Home, own); err != nil {
			return err
		}

		context.State.DeviceName = own.Name
	}

	context.State.Files = client.Text(manifests.FilesCodec.Write(context.Checkpoint.Files))
	context.State.Headers = []string{}

	for _, v := range context.Headers {
		context.State.Headers = append(context.State.Headers, client.Text(encoding.SignedCodec(manifests.ManifestHeaderCodec).Write(v)))
	}

	context.State.Entries = []string{}

	for _, v := range context.Entries {
		context.State.Entries = append(context.State.Entries, client.Text(encoding.SignedCodec(codecs.EntryCodec).Write(v)))
	}

	timing := context.Adapters.Timing
	timing.Now = context.Options.Now

	return store.SaveState(context.Context, context.Adapters.Home, context.State, timing)
}
