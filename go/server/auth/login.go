package auth

import (
	"encoding/json"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

type loginSession struct {
	State   string `json:"state"`
	Receipt string `json:"receipt"`
}

func requirePurpose(auth *shared.Auth, purpose string) error {
	if (purpose == "unlock") != auth.Member {
		return enverrors.New(enverrors.NotMember, "Invalid login purpose")
	}

	return nil
}

func StartLogin(o shared.Options, auth *shared.Auth, purpose, message string) (wire.MailboxWrite, error) {
	if err := requirePurpose(auth, purpose); err != nil {
		return wire.MailboxWrite{}, err
	}

	r := auth.Request
	receipt, err := Charge(o, auth)
	if err != nil {
		return wire.MailboxWrite{}, err
	}

	record, err := o.Storage.State(r.VaultId, adapters.StateOpaqueRecord, []byte{})
	if err != nil {
		return wire.MailboxWrite{}, err
	}

	var registration *string
	if record != nil {
		text := shared.Text(record)
		registration = &text
	}
	ids, err := opaque.UnlockIdentifiers(r.VaultId)
	if err != nil {
		return wire.MailboxWrite{}, err
	}

	result, err := opaque.OpaqueServerStartLogin(opaque.ServerStartLoginParams{ServerSetup: o.ServerKeys.OpaqueSetup, UserIdentifier: ids.UserIdentifier, Identifiers: ids.Identifiers, RegistrationRecord: registration, StartLoginRequest: message})
	if err != nil {
		return wire.MailboxWrite{}, err
	}

	sessionBytes, err := shared.JSON(loginSession{result.ServerLoginState, receipt})
	if err != nil {
		return wire.MailboxWrite{}, err
	}
	if err := o.Storage.PutSession(r.VaultId, sessionKey(auth, purpose), sessionBytes, o.Now()); err != nil {
		return wire.MailboxWrite{}, err
	}

	return wire.MailboxWrite{Message: result.LoginResponse}, nil
}

func FinishLogin(o shared.Options, auth *shared.Auth, purpose, message string) (wire.LoginFinishResponse, error) {
	if err := requirePurpose(auth, purpose); err != nil {
		return wire.LoginFinishResponse{}, err
	}

	id := auth.Request.VaultId
	data, err := o.Storage.ConsumeSession(id, sessionKey(auth, purpose), o.Now())
	if err != nil {
		return wire.LoginFinishResponse{}, err
	}
	if data == nil {
		return wire.LoginFinishResponse{}, enverrors.New(enverrors.Unauthorized, "Login expired or consumed")
	}
	var session loginSession
	if err := json.Unmarshal(data, &session); err != nil {
		return wire.LoginFinishResponse{}, err
	}
	ids, err := opaque.UnlockIdentifiers(id)
	if err != nil {
		return wire.LoginFinishResponse{}, err
	}
	if _, err := opaque.OpaqueServerFinishLogin(opaque.ServerFinishLoginParams{ServerLoginState: session.State, FinishLoginRequest: message, Identifiers: ids.Identifiers}); err != nil {
		return wire.LoginFinishResponse{}, enverrors.New(enverrors.Unauthorized, "Login failed; vault may have moved")
	}
	_, err = shared.Transaction(o.Storage, func() (bool, error) {
		if err := complete(o, auth, purpose, session.Receipt); err != nil {
			return false, err
		}

		return true, nil
	})
	if err != nil {
		return wire.LoginFinishResponse{}, err
	}
	if purpose == "kit" {
		return wire.LoginFinishResponse{Kind: "ticket"}, nil
	}
	vault, err := o.Storage.Vault(id)
	if err != nil {
		return wire.LoginFinishResponse{}, err
	}
	if vault.Restored != nil {
		return wire.LoginFinishResponse{Kind: "staged"}, nil
	}
	window, err := UnlockWindow(o, id, auth.Request.Device)
	if err != nil {
		return wire.LoginFinishResponse{}, err
	}

	return wire.LoginFinishResponse{Kind: "unlocked", UnlockedUntil: window.UnlockedUntil, FreshUntil: &window.FreshUntil}, nil
}

func complete(o shared.Options, auth *shared.Auth, purpose, receipt string) error {
	r := auth.Request
	id := r.VaultId
	requiresMembership := purpose != "kit"
	if requiresMembership {
		membership, err := vaultchain.Membership(o, id, r.Device)
		if err != nil {
			return err
		}
		requiresMembership = membership == nil
	}
	if requiresMembership {
		return enverrors.New(enverrors.NotMember, "Membership required")
	}
	vault, err := o.Storage.Vault(id)
	if err != nil {
		return err
	}
	if purpose == "kit" {
		if err := o.Storage.PutSession(id, adapters.SessionKey{Kind: adapters.SessionJoinTicket, Device: r.Device, Purpose: "kit"}, []byte{1}, o.Now()); err != nil {
			return err
		}
	} else if vault.Restored != nil {
		hasProof, err := HasProof(o, auth, "repair")
		if err != nil {
			return err
		}
		requiresRegistration := !hasProof
		if !requiresRegistration {
			registrationRequired, err := RegistrationRequired(o, id)
			if err != nil {
				return err
			}
			requiresRegistration = registrationRequired
		}
		if requiresRegistration {
			return enverrors.New(enverrors.Unauthorized, "Registration required")
		}
		if err := o.Storage.PutSession(id, sessionKey(auth, "repair-finish"), vault.Restored.RepairTokenHash, o.Now()); err != nil {
			return err
		}
	} else {
		device, err := o.Storage.Device(id, r.Device)
		if err != nil {
			return err
		}

		state := *device

		state.UnlockedUntil = 9007199254740991
		if vault.UnlockPeriod != nil {
			state.UnlockedUntil = o.Now() + *vault.UnlockPeriod
		}
		state.FreshUntil = o.Now() + 600000
		if err := o.Storage.PutDevice(id, r.Device, state); err != nil {
			return err
		}
	}
	if _, err := o.Storage.Refund(receipt, o.Now()); err != nil {
		return err
	}

	return nil
}
