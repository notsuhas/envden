package auth

import (
	"encoding/json"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	opaque "github.com/notsuhas/envden/go/core/protocol/opaque"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
)

type loginSession struct {
	State   string `json:"state"`
	Receipt string `json:"receipt"`
}

func requirePurpose(auth *x.Auth, purpose string) {
	if (purpose == "unlock") != auth.Member {
		x.Fail(e.NotMember, "Invalid login purpose")
	}
}
func StartLogin(o x.Options, auth *x.Auth, purpose, message string) s.MailboxWrite {
	requirePurpose(auth, purpose)
	r := auth.Request
	receipt := Charge(o, auth)
	record := x.Must(o.Storage.State(r.VaultId, a.StateOpaqueRecord, []byte{}))
	var registration *string
	if record != nil {
		text := x.Text(record)
		registration = &text
	}
	ids := x.Must(opaque.UnlockIdentifiers(r.VaultId))
	result := x.Must(opaque.OpaqueServerStartLogin(opaque.ServerStartLoginParams{ServerSetup: o.ServerKeys.OpaqueSetup, UserIdentifier: ids.UserIdentifier, Identifiers: ids.Identifiers, RegistrationRecord: registration, StartLoginRequest: message}))
	x.Check(o.Storage.PutSession(r.VaultId, sessionKey(auth, purpose), x.JSON(loginSession{result.ServerLoginState, receipt}), o.Now()))
	return s.MailboxWrite{Message: result.LoginResponse}
}
func FinishLogin(o x.Options, auth *x.Auth, purpose, message string) s.LoginFinishResponse {
	requirePurpose(auth, purpose)
	id := auth.Request.VaultId
	data := x.Must(o.Storage.ConsumeSession(id, sessionKey(auth, purpose), o.Now()))
	if data == nil {
		x.Fail(e.Unauthorized, "Login expired or consumed")
	}
	var session loginSession
	x.Check(json.Unmarshal(data, &session))
	ids := x.Must(opaque.UnlockIdentifiers(id))
	_, err := opaque.OpaqueServerFinishLogin(opaque.ServerFinishLoginParams{ServerLoginState: session.State, FinishLoginRequest: message, Identifiers: ids.Identifiers})
	if err != nil {
		x.Fail(e.Unauthorized, "Login failed; vault may have moved")
	}
	x.Transaction(o.Storage, func() bool { complete(o, auth, purpose, session.Receipt); return true })
	if purpose == "kit" {
		return s.LoginFinishResponse{Kind: "ticket"}
	}
	if x.Must(o.Storage.Vault(id)).Restored != nil {
		return s.LoginFinishResponse{Kind: "staged"}
	}
	window := UnlockWindow(o, id, auth.Request.Device)
	return s.LoginFinishResponse{Kind: "unlocked", UnlockedUntil: window.UnlockedUntil, FreshUntil: &window.FreshUntil}
}
func complete(o x.Options, auth *x.Auth, purpose, receipt string) {
	r := auth.Request
	id := r.VaultId
	if purpose != "kit" && v.Membership(o, id, r.Device) == nil {
		x.Fail(e.NotMember, "Membership required")
	}
	vault := x.Must(o.Storage.Vault(id))
	if purpose == "kit" {
		x.Check(o.Storage.PutSession(id, a.SessionKey{Kind: a.SessionJoinTicket, Device: r.Device, Purpose: "kit"}, []byte{1}, o.Now()))
	} else if vault.Restored != nil {
		if !HasProof(o, auth, "repair") || RegistrationRequired(o, id) {
			x.Fail(e.Unauthorized, "Registration required")
		}
		x.Check(o.Storage.PutSession(id, sessionKey(auth, "repair-finish"), vault.Restored.RepairTokenHash, o.Now()))
	} else {
		state := *x.Must(o.Storage.Device(id, r.Device))
		state.UnlockedUntil = 9007199254740991
		if vault.UnlockPeriod != nil {
			state.UnlockedUntil = o.Now() + *vault.UnlockPeriod
		}
		state.FreshUntil = o.Now() + 600000
		x.Check(o.Storage.PutDevice(id, r.Device, state))
	}
	x.Must(o.Storage.Refund(receipt, o.Now()))
}
func UnlockWindow(o x.Options, id, device []byte) s.UnlockWindow {
	state := x.Must(o.Storage.Device(id, device))
	vault := x.Must(o.Storage.Vault(id))
	var until *int64
	if vault.UnlockPeriod != nil {
		until = &state.UnlockedUntil
	}
	return s.UnlockWindow{UnlockedUntil: until, FreshUntil: state.FreshUntil}
}
func SetUnlockPeriod(o x.Options, auth *x.Auth, period *int64) s.UnlockPeriod {
	x.Transaction(o.Storage, func() bool {
		r := auth.Request
		vault := x.Must(o.Storage.Vault(r.VaultId))
		if vault == nil {
			x.Fail(e.NotFound, "Unknown vault")
		}
		fresh := *auth
		fresh.Member = v.Membership(o, r.VaultId, r.Device) != nil
		RequireGate(o, &fresh, "fresh")
		vault.UnlockPeriod = period
		x.Check(o.Storage.ConfigureVault(r.VaultId, *vault, nil, nil))
		if period != nil {
			x.Check(o.Storage.CapUnlocks(r.VaultId, o.Now()+*period))
		}
		return true
	})
	return s.UnlockPeriod{Period: period}
}
