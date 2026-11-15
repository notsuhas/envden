package join

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/rejoin/classify"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/join/material"
	k "github.com/notsuhas/envden/go/cli/vault/keys"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
	"strconv"
)

func AcceptJoin(ctx context.Context, a contracts.Adapters, cl *client.Client, ident identity.Identity, address string, pin []byte, history vault.History, manifestHash []byte) (*model.State, error) {
	var result *model.State
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		header, at, err := material.JoinMembership(history, ident.Record.Id, pin, manifestHash)
		if err != nil {
			return err
		}
		state, err := LocalState(a.Home, b.Base32(history.State.VaultId))
		if err != nil {
			return err
		}
		dropped := false
		if state != nil && state.Checkpoint != "" {
			checkpoint, err := client.Binary(state.Checkpoint)
			if err != nil {
				return err
			}
			if !vault.HistoryHasHeader(history, checkpoint) {
				classification, err := classify.CheckRejoin(ctx, a, history)
				if err != nil {
					return err
				}
				dropped = classification != nil && classification.Kind == "dropped-by-repair"
				if !dropped {
					if err = material.RequireLocalFloor(history, state.Checkpoint); err != nil {
						return err
					}
				}
			}
			if !dropped {
				if err = session.RecordUnlockWindow(ctx, cl, state); err != nil {
					return err
				}
				result, err = advanceCheckpoint(ctx, a, cl, ident, state, history)
				return err
			}
		}
		wrap := k.DeviceWrap(history.Entries, ident.Record.Id, &header.Body.ListSeq)
		commit := at.Commits[header.Body.Epoch]
		if wrap == nil || commit == nil {
			return errors.New(errors.InvalidData, "Missing device epoch wrap")
		}
		key, err := epochs.OpenWrap(*wrap, ident.Keys.EncSk, ident.Record.EncPub, history.State.VaultId, header.Body.Epoch, commit)
		if err != nil {
			return err
		}
		box, err := material.VerifiedBlob(ctx, cl, "keyrings", "keyring-blob", header.Body.KeyringHash)
		if err != nil {
			return err
		}
		var known []byte
		if state != nil {
			known, err = a.Keychain.Get("envden/"+a.Home+"/id-key", false)
			if err != nil {
				return err
			}
		}
		ring, err := keyring.OpenKeyring(box, key, history.State.VaultId, header.Body.Epoch, at.Commits, known)
		if err != nil {
			return err
		}
		files, err := material.VerifiedBlob(ctx, cl, "files", "files", header.Body.FilesHash)
		if err != nil {
			return err
		}
		if _, err = b.Decode(m.FilesCodec, files); err != nil {
			return err
		}
		committed := at.Devices[b.Base32(ident.Record.Id)]
		if err = identity.AdoptCommittedName(a.Keychain, a.Home, committed); err != nil {
			return err
		}
		if state == nil {
			state = model.EmptyState(committed.Name)
		}
		state.DeviceName = committed.Name
		state.VerifiedState, err = material.StateJSON(at, history.Entries)
		if err != nil {
			return err
		}
		state.Touch("verifiedState")
		state.VaultID = b.Base32(history.State.VaultId)
		state.Touch("vaultId")
		state.Server = &model.Server{Address: address, Pin: client.Text(pin), Protocol: 1}
		state.Touch("server")
		state.Checkpoint = client.Text(manifestHash)
		state.Touch("checkpoint")
		state.Headers = []string{}
		state.Entries = []string{}
		for _, h := range history.Headers {
			if h.Body.Seq <= header.Body.Seq {
				raw, err := b.Encode(p.SignedCodec(m.ManifestHeaderCodec), h)
				if err != nil {
					return err
				}
				state.Headers = append(state.Headers, client.Text(raw))
			}
		}
		for _, e := range history.Entries {
			if e.Body.Seq <= header.Body.ListSeq {
				raw, err := b.Encode(p.SignedCodec(p.EntryCodec), e)
				if err != nil {
					return err
				}
				state.Entries = append(state.Entries, client.Text(raw))
			}
		}
		state.Keyring = client.Text(box)
		state.Touch("keyring")
		state.Files = client.Text(files)
		state.Touch("files")
		if err = session.RecordUnlockWindow(ctx, cl, state); err != nil {
			return err
		}
		if state.Session != nil {
			state.Touch("session")
		}
		if err = a.Keychain.Set("envden/"+a.Home+"/epoch/"+strconv.Itoa(header.Body.Epoch), key); err != nil {
			return err
		}
		if err = a.Keychain.Set("envden/"+a.Home+"/id-key", ring.IdKey); err != nil {
			return err
		}
		result = state
		return store.SaveState(ctx, a.Home, state, a.Timing)
	})
	return result, err
}
