package pairing

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/pairing/persistence"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	codecspairing "github.com/notsuhas/envden/go/core/protocol/codecs/pairing"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	protocolpairing "github.com/notsuhas/envden/go/core/protocol/pairing"
)

type storedJoiner struct {
	Mailbox int    `json:"mailbox"`
	KE3     string `json:"ke3"`
	Message string `json:"message"`
}

func ExchangeJoiner(ctx context.Context, a contracts.Adapters, cl *client.Client, ident identity.Identity, pin []byte, code string, wait func(int64) error) error {
	err := exchangeJoiner(ctx, a, cl, ident, pin, code, wait)
	if err == nil {
		return nil
	}

	saved, readErr := files.OptionalRead(filepath.Join(a.Home, "state", "pair-joiner"))
	if readErr != nil {
		return readErr
	}

	if saved == nil || *saved == "" {
		if clearErr := lock.WithStateLock(ctx, a.Home, a.Timing, func(context.Context) error { return persistence.ClearJoiner(a) }); clearErr != nil {
			return clearErr
		}

		if errors.Is(err, errors.Busy) {
			return errors.New(errors.Busy, "Pairing timed out before login; create a new pairing code")
		}
	}

	if errors.Is(err, errors.Unauthorized) || errors.Is(err, errors.Conflict) || errors.Is(err, errors.InvalidData) || errors.Is(err, errors.NotFound) {
		if clearErr := lock.WithStateLock(ctx, a.Home, a.Timing, func(context.Context) error { return persistence.ClearJoiner(a) }); clearErr != nil {
			return clearErr
		}
	}

	return err
}

func exchangeJoiner(ctx context.Context, a contracts.Adapters, cl *client.Client, ident identity.Identity, pin []byte, code string, wait func(int64) error) error {
	rejoinKey, err := a.Keychain.Get("envden/"+a.Home+"/rejoin/device", false)
	if err != nil {
		return err
	}

	rejoin := false
	if rejoinKey != nil {
		stored, err := identity.ReadIdentity(rejoinKey)
		if err != nil {
			return err
		}

		rejoin = encoding.Equal(stored.Record.Id, ident.Record.Id)
	}

	if err := RefuseCommittedJoin(a, rejoin); err != nil {
		return err
	}

	normalized, err := protocolpairing.NormalizePairingCode(code)
	if err != nil {
		return err
	}

	start, err := opaque.OpaqueStartLogin(normalized.Password)
	if err != nil {
		return err
	}

	expiry, err := PutSlot(ctx, cl, normalized.Mailbox, "KE1", start.StartLoginRequest)
	if err != nil {
		return err
	}

	if err = wait(expiry); err != nil {
		return err
	}

	response, err := GetSlot(ctx, cl, normalized.Mailbox, "KE2")
	if err != nil {
		return err
	}

	ids, err := opaque.PairingIdentifiers(pin, normalized.Mailbox)
	if err != nil {
		return err
	}

	finish, err := opaque.OpaqueFinishLogin(opaque.FinishLoginParams{Password: normalized.Password, ClientLoginState: start.ClientLoginState, LoginResponse: response, Identifiers: ids.Identifiers})
	if err != nil {
		return err
	}

	if !finish.OK {
		return errors.New(errors.Unauthorized, "Incorrect pairing code; make a new code")
	}

	session, err := client.Binary(finish.SessionKey)
	if err != nil {
		return err
	}

	keys, err := protocolpairing.PairingChannelKeys(session)
	clear(session)
	if err != nil {
		return err
	}

	defer clear(keys.ApproverToJoiner)
	defer clear(keys.JoinerToApprover)
	message, err := protocolpairing.SealPairJoiner(codecspairing.PairJoiner{Device: ident.Record}, keys.JoinerToApprover)
	if err != nil {
		return err
	}

	err = lock.WithStateLock(ctx, a.Home, a.Timing, func(context.Context) error {
		if err := a.Keychain.Set("envden/"+a.Home+"/pair-receive", keys.ApproverToJoiner); err != nil {
			return err
		}

		raw, err := jsonvalue.Marshal(storedJoiner{normalized.Mailbox, finish.FinishLoginRequest, client.Text(message)})
		if err != nil {
			return err
		}

		return files.AtomicWrite(filepath.Join(a.Home, "state", "pair-joiner"), raw, a.Now)
	})
	if err != nil {
		return err
	}

	if _, err = PutSlot(ctx, cl, normalized.Mailbox, "KE3", finish.FinishLoginRequest); err != nil {
		return err
	}

	_, err = PutSlot(ctx, cl, normalized.Mailbox, "PairJoiner", client.Text(message))

	return err
}
