package pairing

import (
	"context"
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/admin/rejoin/classify"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/pairing/persistence"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/vault"
	join "github.com/notsuhas/envden/go/cli/vault/join"
	"github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	p "github.com/notsuhas/envden/go/core/protocol/pairing"
	"io"
	"path/filepath"
	"strconv"
)

func ResendJoiner(ctx context.Context, a contracts.Adapters, cl *client.Client, rejoin ...bool) error {
	if err := RefuseCommittedJoin(a, len(rejoin) > 0 && rejoin[0]); err != nil {
		return err
	}
	saved, err := files.OptionalRead(filepath.Join(a.Home, "state", "pair-joiner"))
	if err != nil || saved == nil || *saved == "" {
		return err
	}
	var value storedJoiner
	var fields map[string]json.RawMessage
	if json.Unmarshal([]byte(*saved), &value) != nil || json.Unmarshal([]byte(*saved), &fields) != nil || fields["mailbox"] == nil || fields["ke3"] == nil || fields["message"] == nil {
		return errors.New(errors.InvalidData, "Invalid stored pairing exchange")
	}
	_, err = PutSlot(ctx, cl, value.Mailbox, "KE3", value.KE3)
	if err == nil {
		_, err = PutSlot(ctx, cl, value.Mailbox, "PairJoiner", value.Message)
	}
	if errors.Is(err, errors.NotFound) {
		return nil
	}
	return err
}

func ResumeJoiner(ctx context.Context, a contracts.Adapters, cl *client.Client, ident identity.Identity, address string, pin []byte, rejoin ...bool) (*model.State, error) {
	var state *model.State
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		if err := RefuseCommittedJoin(a, len(rejoin) > 0 && rejoin[0]); err != nil {
			return err
		}
		key, err := a.Keychain.Get("envden/"+a.Home+"/pair-receive", false)
		if err != nil {
			return err
		}
		if key == nil {
			return errors.New(errors.NotFound, "No pairing exchange to resume")
		}
		defer clear(key)
		response, err := cl.Request(ctx, "/v1/pairing/approver", "GET", nil)
		if err != nil {
			return err
		}
		raw, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			return err
		}
		value, err := s.MessageResponseSchema.Decode(raw)
		if err != nil {
			return err
		}
		raw, err = client.Binary(value.Message)
		if err != nil {
			return err
		}
		approver, err := p.OpenPairApprover(raw, key)
		if err != nil {
			return err
		}
		if !b.Equal(approver.ServerPin, pin) {
			return errors.New(errors.Unauthorized, "Pairing server pin mismatch")
		}
		hc := cl.ForVault(approver.VaultId)
		history, err := vault.ReadHistory(ctx, hc, approver.VaultId, nil)
		if err != nil {
			return err
		}
		if len(rejoin) > 0 && rejoin[0] {
			if _, err = classify.AdoptRejoin(ctx, a, history); err != nil {
				return err
			}
		}
		state, err = join.AcceptJoin(ctx, a, hc, ident, address, pin, history, approver.ManifestHash)
		if err == nil && len(rejoin) > 0 && rejoin[0] {
			err = classify.FinishRejoinIdentity(a)
		}
		if err != nil {
			return err
		}
		return persistence.ClearJoiner(a)
	})
	if errors.Is(err, errors.InvalidData) || errors.Is(err, errors.Fork) || errors.Is(err, errors.Unauthorized) || errors.Is(err, errors.Conflict) {
		if e := persistence.ClearJoiner(a); e != nil {
			return nil, e
		}
	}
	return state, err
}

func FinishPairing(ctx context.Context, a contracts.Adapters, cl *client.Client, ident identity.Identity, address string, pin []byte, now func() int64, pause func(context.Context) error, rejoin ...bool) (*model.State, error) {
	stored, err := files.OptionalRead(filepath.Join(a.Home, "state", "pair-expiry"))
	if err != nil {
		return nil, err
	}
	expiresAt := now() + 86400000
	exchangeExpiry := int64(0)
	if stored != nil {
		exchangeExpiry, err = strconv.ParseInt(*stored, 10, 64)
		if err != nil {
			return nil, err
		}
		expiresAt = ApprovalDeadline(exchangeExpiry)
	}
	if stored != nil && now() < exchangeExpiry {
		if err = ResendJoiner(ctx, a, cl, rejoin...); err != nil {
			return nil, err
		}
	}
	if _, err = WaitMessage(ctx, cl, "/v1/pairing/approver", now, expiresAt, pause); err == nil {
		return ResumeJoiner(ctx, a, cl, ident, address, pin, rejoin...)
	}
	if errors.Is(err, errors.Unauthorized) || errors.Is(err, errors.InvalidData) || errors.Is(err, errors.Fork) {
		if e := persistence.ClearJoiner(a); e != nil {
			return nil, e
		}
	}
	return nil, err
}
