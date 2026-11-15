package recovery

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/rejoin/classify"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	join "github.com/notsuhas/envden/go/cli/vault/join"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/envelope"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"io"
	"os"
	"path/filepath"
)

func attemptKitJoin(ctx context.Context, a contracts.Adapters, o JoinOptions) (*model.State, error) {
	if _, err := join.LocalState(a.Home, o.VaultID); err != nil {
		return nil, err
	}
	id, err := b.Unbase32(o.VaultID)
	if err != nil {
		return nil, err
	}
	server, err := client.Hello(ctx, o.Address, nil, a.Fetcher, version.MinServer)
	if err != nil {
		return nil, err
	}
	pending := filepath.Join(a.Home, "state", "kit-join")
	attempt, err := jsonvalue.Marshal(struct {
		VaultID string `json:"vaultId"`
		Pin     string `json:"pin"`
		Name    string `json:"name"`
	}{o.VaultID, b.Base32(server.Pin), o.Name})
	if err != nil {
		return nil, err
	}
	saved, err := files.OptionalRead(pending)
	if err != nil {
		return nil, err
	}
	resuming := saved != nil && *saved == string(attempt)
	local, err := store.LoadState(a.Home)
	if err != nil {
		return nil, err
	}
	var ident identity.Identity
	if o.Rejoin {
		ident, err = classify.RejoinIdentity(ctx, a, o.Name)
	} else {
		ident, err = identity.DeviceIdentity(ctx, a.Keychain, a.Home, o.Name, !resuming && (local == nil || local.Checkpoint == ""), a.Timing)
	}
	if err != nil {
		return nil, err
	}
	if err = files.AtomicWrite(pending, attempt, a.Now); err != nil {
		return nil, err
	}
	cl := client.CreateClient(client.Options{HelloCache: a.HelloCache, Address: o.Address, Pin: server.Pin, VaultID: id, Identity: ident, Version: version.Version, Now: o.Now, Fetcher: a.Fetcher})
	purpose := "kit"
	if resuming {
		purpose = ""
	}
	_, err = session.Login(ctx, cl, id, session.Password{Value: o.Password}, purpose)
	if resuming && errors.Is(err, errors.NotMember) {
		_, err = session.Login(ctx, cl, id, session.Password{Value: o.Password}, "kit")
	}
	if err != nil {
		return nil, err
	}
	history, err := vault.ReadHistory(ctx, cl, id, nil)
	if err != nil {
		return nil, err
	}
	if !b.Equal(history.State.ServerPin, server.Pin) {
		return nil, errors.New(errors.Moving, "Vault moved; use its current server address")
	}
	if o.Rejoin {
		if _, err = classify.CheckRejoin(ctx, a, history); err != nil {
			return nil, err
		}
	}
	if _, member := history.State.Devices[b.Base32(ident.Record.Id)]; resuming && member {
		for _, h := range history.Headers {
			if h.Body.Op == 3 && b.Equal(h.Body.Signer, ident.Record.Id) {
				hash, err := c.ObjectHash(m.ManifestHeaderCodec, h, "manifest")
				if err != nil {
					return nil, err
				}
				if o.Rejoin {
					if _, err = classify.AdoptRejoin(ctx, a, history); err != nil {
						return nil, err
					}
				}
				state, err := join.AcceptJoin(ctx, a, cl, ident, o.Address, server.Pin, history, hash)
				if err == nil && o.Rejoin {
					err = classify.FinishRejoinIdentity(a)
				}
				if err == nil {
					err = removePending(pending)
				}
				return state, err
			}
		}
		return nil, errors.New(errors.InvalidData, "Missing kit join checkpoint")
	}
	secret, err := keys.DecodeSecretKey(o.SecretKey)
	if err != nil {
		return nil, err
	}
	head := history.Headers[len(history.Headers)-1]
	response, err := cl.Request(ctx, "/v1/envelope", "GET", nil)
	if err != nil {
		return nil, err
	}
	box, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		return nil, err
	}
	if !b.Equal(c.H("envelope-blob", box), head.Body.EnvelopeHash) {
		return nil, errors.New(errors.InvalidData, "Envelope hash mismatch")
	}
	opened, err := envelope.OpenEnvelope(box, o.Password, secret, id)
	clear(secret)
	if err != nil {
		if _, ok := errors.As(err); ok {
			return nil, err
		}
		return nil, errors.Wrap(errors.InvalidData, "Invalid recovery envelope", err)
	}
	defer clear(opened.RecoveryEncSk)
	defer clear(opened.RecoveryObjSk)
	epochKey, err := RecoveryEpochKey(history, opened, opened.RecoveryEncSk, id)
	if err != nil {
		return nil, err
	}
	swap, err := vault.AddDeviceSwap(history, vault.NamedForList(ident.Record, history), history.State.Recovery.Id, opened.RecoveryObjSk, epochKey, 3, o.Now(), ident.Record.Id, ident.Keys.ObjSk)
	if err != nil {
		return nil, err
	}
	verified, err := c.VerifyObject(p.EntryCodec, swap.Entries[0], history.State.Recovery.ObjPub, "entry")
	if err != nil {
		return nil, err
	}
	if !verified.OK {
		return nil, errors.New(errors.InvalidData, "Recovery key is no longer current")
	}
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		return nil, err
	}
	response, err = cl.Request(ctx, "/v1/swap", "POST", raw)
	if err != nil {
		return nil, err
	}
	response.Body.Close()
	updated, err := vault.ReadHistory(ctx, cl, id, nil)
	if err != nil {
		return nil, err
	}
	hash, err := c.ObjectHash(m.ManifestHeaderCodec, swap.Header, "manifest")
	if err != nil {
		return nil, err
	}
	if o.Rejoin {
		if _, err = classify.AdoptRejoin(ctx, a, updated); err != nil {
			return nil, err
		}
	}
	state, err := join.AcceptJoin(ctx, a, cl, ident, o.Address, server.Pin, updated, hash)
	if err == nil && o.Rejoin {
		err = classify.FinishRejoinIdentity(a)
	}
	if err == nil {
		err = removePending(pending)
	}
	return state, err
}

func removePending(path string) error {
	err := os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
