package auth

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	opaque "github.com/notsuhas/envden/go/core/protocol/opaque"
	x "github.com/notsuhas/envden/go/server/shared"
)

func authorityToken(o x.Options, auth *x.Auth) []byte {
	if HasProof(o, auth, "setup") {
		return x.Must(o.Storage.SetupToken())
	}
	vault := x.Must(o.Storage.Vault(auth.Request.VaultId))
	if vault != nil && vault.Restored != nil {
		return vault.Restored.RepairTokenHash
	}
	return nil
}
func sessionKey(auth *x.Auth, purpose string) a.SessionKey {
	return a.SessionKey{Kind: a.SessionLogin, Device: auth.Request.Device, Purpose: purpose}
}
func StartRegistration(o x.Options, auth *x.Auth, message string) s.MailboxWrite {
	AuthorizeRegistration(o, auth)
	receipt := Charge(o, auth)
	token := authorityToken(o, auth)
	id := auth.Request.VaultId
	if token != nil {
		x.Check(o.Storage.PutSession(id, sessionKey(auth, "registration-authority"), token, o.Now()))
	}
	ids := x.Must(opaque.UnlockIdentifiers(id))
	result := x.Must(opaque.OpaqueRegistrationResponse(opaque.RegistrationResponseParams{ServerSetup: o.ServerKeys.OpaqueSetup, UserIdentifier: ids.UserIdentifier, RegistrationRequest: message}))
	x.Check(o.Storage.PutSession(id, sessionKey(auth, "registration"), []byte(receipt), o.Now()))
	return s.MailboxWrite{Message: result.RegistrationResponse}
}
func FinishRegistration(o x.Options, auth *x.Auth, message string) s.KindResponse {
	AuthorizeRegistration(o, auth)
	id := auth.Request.VaultId
	token := authorityToken(o, auth)
	if token != nil {
		authority := x.Must(o.Storage.Session(id, sessionKey(auth, "registration-authority"), o.Now()))
		if authority == nil || !bytes.Equal(authority, token) {
			x.Fail(e.Unauthorized, "Registration token changed")
		}
	}
	receipt := x.Must(o.Storage.ConsumeSession(id, sessionKey(auth, "registration"), o.Now()))
	if receipt == nil {
		x.Fail(e.Unauthorized, "Registration expired or consumed")
	}
	x.Transaction(o.Storage, func() bool {
		record := x.Binary(message)
		x.Check(o.Storage.PutSession(id, sessionKey(auth, "registration-record"), record, o.Now()))
		vault := x.Must(o.Storage.Vault(id))
		if vault != nil && !vault.Active {
			x.Check(o.Storage.WriteState(id, []a.StateWrite{{Kind: a.StateMoveSession, Key: []byte("registration"), Bytes: record}, {Kind: a.StateMoveSession, Key: []byte("registration-receipt"), Bytes: receipt}}))
		}
		if vault != nil && vault.Restored != nil {
			x.Check(o.Storage.PutSession(id, sessionKey(auth, "registration-repair"), vault.Restored.RepairTokenHash, o.Now()))
		}
		x.Check(o.Storage.PutSession(id, sessionKey(auth, "registration-receipt"), receipt, o.Now()))
		return true
	})
	return s.KindResponse{Kind: "registered"}
}
func RequireStagedRecord(o x.Options, id, device, data []byte) a.SessionKey {
	key := a.SessionKey{Kind: a.SessionLogin, Device: device, Purpose: "registration-record"}
	record := x.Must(o.Storage.Session(id, key, o.Now()))
	if record == nil || !bytes.Equal(record, data) {
		x.Fail(e.Unauthorized, "Staged registration required")
	}
	return key
}
func RefundRegistration(o x.Options, id, device []byte) {
	key := []byte("registration-receipt")
	receipt := x.Must(o.Storage.State(id, a.StateMoveSession, key))
	if receipt == nil {
		receipt = x.Must(o.Storage.ConsumeSession(id, a.SessionKey{Kind: a.SessionLogin, Device: device, Purpose: "registration-receipt"}, o.Now()))
	}
	x.Check(o.Storage.WriteState(id, []a.StateWrite{{Kind: a.StateMoveSession, Key: key}}))
	if receipt != nil {
		x.Must(o.Storage.Refund(string(receipt), o.Now()))
	}
}
