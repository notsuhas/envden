package identity

import (
	"bytes"
	"context"

	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func DeviceIdentity(ctx context.Context, keychain adapters.Keychain, namespace, name string, fresh bool, timing lock.Timing) (Identity, error) {
	var result Identity
	err := lock.WithStateLock(ctx, namespace, timing, func(context.Context) error {
		slot := "envden/" + namespace + "/device"
		stored, err := keychain.Get(slot, false)
		if err != nil {
			return err
		}

		if stored != nil && !fresh {
			result, err = ReadIdentity(stored)

			return err
		}

		state, err := store.LoadState(namespace)
		if err != nil {
			return err
		}

		if state != nil && (len(state.VerifiedState) > 0 || state.VaultID != "" && state.CreationPending == "") {
			return errors.New(errors.Locked, "Vault keys unavailable")
		}

		k, err := keys.GenerateDeviceKeys()
		if err != nil {
			return err
		}

		id, err := keys.DeviceID(k.EncPub, k.ObjPub, k.ReqPub)
		if err != nil {
			return err
		}

		result = Identity{SecretKeys{k.EncSk, k.ObjSk, k.ReqSk}, members.DeviceRecord{Id: id, Name: name, EncPub: k.EncPub, ObjPub: k.ObjPub, ReqPub: k.ReqPub}}
		raw, err := IdentityBytes(result.Keys, result.Record)
		if err != nil {
			return err
		}

		return keychain.Set(slot, raw)
	})

	return result, err
}

func AdoptCommittedName(keychain adapters.Keychain, home string, committed members.DeviceRecord) error {
	for _, slot := range []string{"envden/" + home + "/rejoin/device", "envden/" + home + "/device"} {
		stored, err := keychain.Get(slot, false)
		if err != nil {
			return err
		}

		if stored == nil {
			continue
		}

		identity, err := ReadIdentity(stored)
		if err != nil {
			return err
		}

		if !bytes.Equal(identity.Record.Id, committed.Id) || identity.Record.Name == committed.Name {
			continue
		}

		identity.Record.Name = committed.Name
		raw, err := IdentityBytes(identity.Keys, identity.Record)
		if err != nil {
			return err
		}

		if err = keychain.Set(slot, raw); err != nil {
			return err
		}
	}

	return nil
}
