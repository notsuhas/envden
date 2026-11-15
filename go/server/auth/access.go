package auth

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	repair "github.com/notsuhas/envden/go/core/chain/repair"
	e "github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/proofs"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
)

func HasProof(o x.Options, auth *x.Auth, kind string) bool {
	if auth.Proof == nil {
		return false
	}
	r := auth.Request
	vault := x.Must(o.Storage.Vault(r.VaultId))
	if kind == "sk" {
		pub := x.Must(o.Storage.State(r.VaultId, a.StateSKPub, []byte{}))
		return (vault == nil || !vault.SKRefused) && pub != nil && x.Must(p.VerifySKProof(pub, r, auth.Proof)).OK
	}
	var key []byte
	if kind == "setup" {
		key = x.Must(o.Storage.SetupToken())
		if x.Must(o.Storage.HasVault(r.VaultId)) {
			return false
		}
	} else if vault != nil && vault.Restored != nil {
		key = vault.Restored.RepairTokenHash
	}
	return key != nil && x.Must(p.VerifyTokenProof(kind, key, r, auth.Proof)).OK
}
func RequireGate(o x.Options, auth *x.Auth, gate string) {
	r := auth.Request
	state := x.Must(o.Storage.Device(r.VaultId, r.Device))
	vault := x.Must(o.Storage.Vault(r.VaultId))
	never := gate == "unlocked" && vault != nil && vault.UnlockPeriod == nil
	var until int64
	if state != nil {
		until = state.UnlockedUntil
		if gate == "fresh" {
			until = state.FreshUntil
		}
	}
	if !auth.Member || !never && (state == nil || o.Now() >= until) {
		x.Fail(e.Locked, "Login required")
	}
}
func RequireRepair(o x.Options, auth *x.Auth) {
	vault := x.Must(o.Storage.Vault(auth.Request.VaultId))
	if vault == nil || vault.Restored == nil || !HasProof(o, auth, "repair") {
		x.Fail(e.Unauthorized, "Repair proof required")
	}
}
func RequireMove(o x.Options, auth *x.Auth) {
	r := auth.Request
	vault := x.Must(o.Storage.Vault(r.VaultId))
	owner := x.Must(o.Storage.State(r.VaultId, a.StateMoveSession, []byte{}))
	if vault == nil || vault.Active || owner == nil || !bytes.Equal(owner, r.Device) {
		x.Fail(e.Unauthorized, "Move session required")
	}
}
func RequireJoinTicket(o x.Options, auth *x.Auth) {
	r := auth.Request
	if x.Must(o.Storage.Session(r.VaultId, a.SessionKey{Kind: a.SessionJoinTicket, Device: r.Device, Purpose: "kit"}, o.Now())) == nil {
		x.Fail(e.Unauthorized, "Join ticket required")
	}
}
func Charge(o x.Options, auth *x.Auth) string {
	if auth.RateReceipt != "" {
		return auth.RateReceipt
	}
	bucket := a.RateBucket{Kind: "non-member"}
	if auth.Member {
		bucket = a.RateBucket{Kind: "member", Device: auth.Request.Device}
	}
	result := x.Must(o.Storage.Charge(auth.Request.VaultId, bucket, o.Now()))
	if result.Kind == "locked" {
		x.Fail(e.RateLimited, "Too many attempts")
	}
	return result.Receipt
}
func AuthorizeRegistration(o x.Options, auth *x.Auth) {
	r := auth.Request
	vault := x.Must(o.Storage.Vault(r.VaultId))
	if vault != nil && !vault.Active {
		RequireMove(o, auth)
		return
	}
	if vault != nil && vault.Restored != nil && !RegistrationRequired(o, r.VaultId) {
		x.Fail(e.Unauthorized, "Repair login required")
	}
	state := x.Must(o.Storage.Device(r.VaultId, r.Device))
	fresh := auth.Member && state != nil && o.Now() < state.FreshUntil
	if !fresh && !HasProof(o, auth, "setup") && !(auth.Member && HasProof(o, auth, "sk")) && !(auth.Member && HasProof(o, auth, "repair")) {
		x.Fail(e.Unauthorized, "Proof required")
	}
}
func RegistrationRequired(o x.Options, id []byte) bool {
	return repair.RepairLoginDecision(v.RepairHistory(o, id)) == "register"
}
