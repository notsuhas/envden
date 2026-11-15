package classify

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/chain/manifests"
	"github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"os"
	"path/filepath"
	"strings"
)

func CheckRejoin(ctx context.Context, a contracts.Adapters, h vault.History) (*manifests.NonMemberResult, error) {
	local, err := store.LoadState(a.Home)
	if err != nil || local == nil || local.Checkpoint == "" {
		return nil, err
	}
	id, err := identity.DeviceIdentity(ctx, a.Keychain, a.Home, local.DeviceName, false, a.Timing)
	if err != nil {
		return nil, err
	}
	headers := []b.Signed[m.ManifestHeader]{}
	entries := []b.Signed[c.Entry]{}
	for _, v := range local.Headers {
		raw, e := client.Binary(v)
		if e != nil {
			return nil, e
		}
		h, e := b.Decode(b.SignedCodec(m.ManifestHeaderCodec), raw)
		if e != nil {
			return nil, e
		}
		headers = append(headers, h)
	}
	for _, v := range local.Entries {
		raw, e := client.Binary(v)
		if e != nil {
			return nil, e
		}
		entry, e := b.Decode(b.SignedCodec(c.EntryCodec), raw)
		if e != nil {
			return nil, e
		}
		entries = append(entries, entry)
	}
	result, err := manifests.ClassifyNonMember(manifests.NonMemberInput{DeviceId: id.Record.Id, StoredHeaders: headers, StoredEntries: entries, VerifiedHeaders: h.Headers, VerifiedEntries: h.Entries, State: h.State})
	if err != nil {
		return nil, err
	}
	if result.Kind == "fork" {
		return nil, errors.New(errors.Fork, "Rejoin history conflicts with the stored floor")
	}
	if result.Kind == "rollback" {
		return nil, errors.New(errors.Rollback, "Rejoin history conflicts with the stored floor")
	}
	return &result, nil
}

func AdoptRejoin(ctx context.Context, a contracts.Adapters, h vault.History) (*manifests.NonMemberResult, error) {
	return CheckRejoin(ctx, a, h)
}
func RejoinIdentity(ctx context.Context, a contracts.Adapters, name string) (identity.Identity, error) {
	return identity.DeviceIdentity(ctx, a.Keychain, a.Home+"/rejoin", name, false, a.Timing)
}
func FinishRejoinIdentity(a contracts.Adapters) error {
	slot := "envden/" + a.Home + "/rejoin/device"
	next, err := a.Keychain.Get(slot, false)
	if err != nil {
		return err
	}
	if next == nil {
		return errors.New(errors.InvalidData, "Missing rejoin identity")
	}
	if err = a.Keychain.Set("envden/"+a.Home+"/device", next); err != nil {
		return err
	}
	if err = a.Keychain.Delete(slot); err != nil {
		return err
	}
	directory := filepath.Join(a.Home, "state")
	entries, err := os.ReadDir(directory)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "rejoin-floor-") {
			if err = os.Remove(filepath.Join(directory, entry.Name())); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}
	return nil
}
