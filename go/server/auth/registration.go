package auth

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	"github.com/notsuhas/envden/go/server/shared"
)

func authorityToken(o shared.Options, auth *shared.Auth) ([]byte, error) {
	hasProof, err := HasProof(o, auth, "setup")
	if err != nil {
		return nil, err
	}
	if hasProof {
		return o.Storage.SetupToken()
	}
	vault, err := o.Storage.Vault(auth.Request.VaultId)
	if err != nil {
		return nil, err
	}
	if vault != nil && vault.Restored != nil {
		return vault.Restored.RepairTokenHash, nil
	}

	return nil, nil
}

func sessionKey(auth *shared.Auth, purpose string) adapters.SessionKey {
	return adapters.SessionKey{Kind: adapters.SessionLogin, Device: auth.Request.Device, Purpose: purpose}
}

func StartRegistration(o shared.Options, auth *shared.Auth, message string) (wire.MailboxWrite, error) {
	if err := AuthorizeRegistration(o, auth); err != nil {
		return wire.MailboxWrite{}, err
	}
	receipt, err := Charge(o, auth)
	if err != nil {
		return wire.MailboxWrite{}, err
	}

	token, err := authorityToken(o, auth)
	if err != nil {
		return wire.MailboxWrite{}, err
	}

	id := auth.Request.VaultId
	if token != nil {
		if err := o.Storage.PutSession(id, sessionKey(auth, "registration-authority"), token, o.Now()); err != nil {
			return wire.MailboxWrite{}, err
		}
	}
	ids, err := opaque.UnlockIdentifiers(id)
	if err != nil {
		return wire.MailboxWrite{}, err
	}

	result, err := opaque.OpaqueRegistrationResponse(opaque.RegistrationResponseParams{ServerSetup: o.ServerKeys.OpaqueSetup, UserIdentifier: ids.UserIdentifier, RegistrationRequest: message})
	if err != nil {
		return wire.MailboxWrite{}, err
	}
	if err := o.Storage.PutSession(id, sessionKey(auth, "registration"), []byte(receipt), o.Now()); err != nil {
		return wire.MailboxWrite{}, err
	}

	return wire.MailboxWrite{Message: result.RegistrationResponse}, nil
}

func FinishRegistration(o shared.Options, auth *shared.Auth, message string) (wire.KindResponse, error) {
	if err := AuthorizeRegistration(o, auth); err != nil {
		return wire.KindResponse{}, err
	}

	id := auth.Request.VaultId
	token, err := authorityToken(o, auth)
	if err != nil {
		return wire.KindResponse{}, err
	}
	if token != nil {
		authority, err := o.Storage.Session(id, sessionKey(auth, "registration-authority"), o.Now())
		if err != nil {
			return wire.KindResponse{}, err
		}
		if authority == nil || !bytes.Equal(authority, token) {
			return wire.KindResponse{}, enverrors.New(enverrors.Unauthorized, "Registration token changed")
		}
	}
	receipt, err := o.Storage.ConsumeSession(id, sessionKey(auth, "registration"), o.Now())
	if err != nil {
		return wire.KindResponse{}, err
	}
	if receipt == nil {
		return wire.KindResponse{}, enverrors.New(enverrors.Unauthorized, "Registration expired or consumed")
	}
	_, err = shared.Transaction(o.Storage, func() (bool, error) {
		record, err := shared.Binary(message)
		if err != nil {
			return false, err
		}
		if err := o.Storage.PutSession(id, sessionKey(auth, "registration-record"), record, o.Now()); err != nil {
			return false, err
		}
		vault, err := o.Storage.Vault(id)
		if err != nil {
			return false, err
		}
		if vault != nil && !vault.Active {
			if err := o.Storage.WriteState(id, []adapters.StateWrite{{Kind: adapters.StateMoveSession, Key: []byte("registration"), Bytes: record}, {Kind: adapters.StateMoveSession, Key: []byte("registration-receipt"), Bytes: receipt}}); err != nil {
				return false, err
			}
		}
		if vault != nil && vault.Restored != nil {
			if err := o.Storage.PutSession(id, sessionKey(auth, "registration-repair"), vault.Restored.RepairTokenHash, o.Now()); err != nil {
				return false, err
			}
		}
		if err := o.Storage.PutSession(id, sessionKey(auth, "registration-receipt"), receipt, o.Now()); err != nil {
			return false, err
		}

		return true, nil
	})
	if err != nil {
		return wire.KindResponse{}, err
	}

	return wire.KindResponse{Kind: "registered"}, nil
}

func RequireStagedRecord(o shared.Options, id, device, data []byte) (adapters.SessionKey, error) {
	key := adapters.SessionKey{Kind: adapters.SessionLogin, Device: device, Purpose: "registration-record"}
	record, err := o.Storage.Session(id, key, o.Now())
	if err != nil {
		return adapters.SessionKey{}, err
	}
	if record == nil || !bytes.Equal(record, data) {
		return adapters.SessionKey{}, enverrors.New(enverrors.Unauthorized, "Staged registration required")
	}

	return key, nil
}

func RefundRegistration(o shared.Options, id, device []byte) error {
	key := []byte("registration-receipt")
	receipt, err := o.Storage.State(id, adapters.StateMoveSession, key)
	if err != nil {
		return err
	}
	if receipt == nil {
		consumeSession, err := o.Storage.ConsumeSession(id, adapters.SessionKey{Kind: adapters.SessionLogin, Device: device, Purpose: "registration-receipt"}, o.Now())
		if err != nil {
			return err
		}

		receipt = consumeSession
	}
	if err := o.Storage.WriteState(id, []adapters.StateWrite{{Kind: adapters.StateMoveSession, Key: key}}); err != nil {
		return err
	}
	if receipt != nil {
		if _, err := o.Storage.Refund(string(receipt), o.Now()); err != nil {
			return err
		}
	}

	return nil
}
