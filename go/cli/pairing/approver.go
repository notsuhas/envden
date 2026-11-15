package pairing

import (
	"context"
	"fmt"
	"io"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/pairing/persistence"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	codecspairing "github.com/notsuhas/envden/go/core/protocol/codecs/pairing"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	protocolpairing "github.com/notsuhas/envden/go/core/protocol/pairing"
)

type Attempt struct {
	Number    int
	ExpiresAt int64
	Local
}

func OpenPairing(ctx context.Context, cl *client.Client, pin []byte) (Attempt, error) {
	response, err := cl.Request(ctx, "/v1/pairing/mailboxes", "POST", nil)
	if err != nil {
		return Attempt{}, err
	}

	raw, err := io.ReadAll(response.Body)
	_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
	if err != nil {
		return Attempt{}, err
	}

	mailbox, err := serverprotocol.MailboxOpenedSchema.Decode(raw)
	if err != nil {
		return Attempt{}, err
	}

	local, err := PreparePairing(pin, mailbox.Number)

	return Attempt{mailbox.Number, mailbox.ExpiresAt, local}, err
}

func ApprovePairing(ctx context.Context, a contracts.Adapters, cl *client.Client, ident identity.Identity, pin, vaultID []byte, attempt Attempt, now func() int64, wait func(string) error, confirm func(string) (bool, error)) (string, error) {
	expiry := min(attempt.ExpiresAt, now()+600000)
	if err := RequireWindow(expiry, now()); err != nil {
		return "", err
	}

	if err := wait("KE1"); err != nil {
		return "", err
	}

	message, err := GetSlot(ctx, cl, attempt.Number, "KE1")
	if err != nil {
		return "", err
	}

	response, err := attempt.Answer(message)
	if err != nil {
		return "", err
	}

	if _, err = PutSlot(ctx, cl, attempt.Number, "KE2", response.LoginResponse); err != nil {
		return "", err
	}

	if err = wait("KE3"); err != nil {
		return "", err
	}

	message, err = GetSlot(ctx, cl, attempt.Number, "KE3")
	if err != nil {
		return "", err
	}

	keys, err := FinishApprover(pin, attempt.Number, response.ServerLoginState, message)
	if err != nil {
		r, e := cl.Request(ctx, fmt.Sprintf("/v1/pairing/mailboxes/%d", attempt.Number), "DELETE", nil)
		if e != nil {
			return "", e
		}

		_ = r.Body.Close() // Best-effort cleanup preserves the original operation result.

		return "", err
	}

	defer clear(keys.ApproverToJoiner)
	defer clear(keys.JoinerToApprover)
	if err = wait("PairJoiner"); err != nil {
		return "", err
	}

	message, err = GetSlot(ctx, cl, attempt.Number, "PairJoiner")
	if err != nil {
		return "", err
	}

	raw, err := client.Binary(message)
	if err != nil {
		return "", err
	}

	candidate, err := protocolpairing.OpenPairJoiner(raw, keys.JoinerToApprover)
	if err != nil {
		return "", err
	}

	history, err := vault.ReadHistory(ctx, cl, vaultID, nil)
	if err != nil {
		return "", err
	}

	proposed := vault.NamedForList(candidate.Device, history)
	approved, err := confirm(proposed.Name)
	if err != nil {
		return "", err
	}

	if !approved {
		r, err := cl.Request(ctx, fmt.Sprintf("/v1/pairing/mailboxes/%d", attempt.Number), "DELETE", nil)
		if err != nil {
			return "", err
		}

		_ = r.Body.Close() // Best-effort cleanup preserves the original operation result.

		return "declined", nil
	}

	err = lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		_, err := client.RetryHead(func() (bool, error) {
			history, err := vault.ReadHistory(ctx, cl, vaultID, nil)
			if err != nil {
				return false, err
			}

			local, err := store.LoadState(a.Home)
			if err != nil {
				return false, err
			}

			if local == nil {
				return false, errors.New(errors.NotFound, "Missing local vault state")
			}

			if err = shared.CheckFloor(local, history); err != nil {
				return false, err
			}

			current, err := shared.CurrentMaterial(ctx, &shared.Context{Adapters: a, Local: local, Client: cl, Identity: ident, VaultID: vaultID, Now: now}, history)
			if err != nil {
				return false, err
			}

			key := current.Key
			if err = RequireWindow(expiry, now()); err != nil {
				return false, err
			}

			swap, err := vault.AddDeviceSwap(history, vault.NamedForList(candidate.Device, history), ident.Record.Id, ident.Keys.ObjSk, key, 2, now(), ident.Record.Id, ident.Keys.ObjSk)
			if err != nil {
				return false, err
			}

			hash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, swap.Header, "manifest")
			if err != nil {
				return false, err
			}

			approver, err := protocolpairing.SealPairApprover(codecspairing.PairApprover{VaultId: vaultID, ServerPin: pin, ManifestHash: hash}, keys.ApproverToJoiner)
			if err != nil {
				return false, err
			}

			swap.Approver = &approver
			raw, err := encoding.Encode(manifests.SwapCodec, swap)
			if err != nil {
				return false, err
			}

			if err = persistence.SaveApproval(a, attempt.Number, raw); err != nil {
				return false, err
			}

			return persistence.SubmitApproval(ctx, a, cl, vaultID)
		})

		return err
	})

	return "paired", err
}
