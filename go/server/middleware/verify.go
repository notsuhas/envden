package middleware

import (
	"net/http"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/versions"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func Verify(o shared.Options, r *http.Request) (*shared.Auth, []byte, func(), error) {
	release := func() {}
	finished := false
	defer func() {
		if !finished {
			release()
		}
	}()
	route, err := RequestRoute(r)
	if err != nil {
		return nil, nil, nil, err
	}

	request, member, err := verifyRequest(o, r)
	if err != nil {
		return nil, nil, nil, err
	}

	compareSemver, err := versions.CompareSemver(request.ClientVersion, o.Config.MinClient)
	if err != nil {
		return nil, nil, nil, err
	}
	if compareSemver <
		0 {
		return nil, nil, nil, enverrors.New(enverrors.ClientTooOld, "Update required")
	}
	path := r.URL.EscapedPath()
	policy := route.Policy
	hasVault, err := o.Storage.HasVault(request.VaultId)
	if err != nil {
		return nil, nil, nil, err
	}
	if !hasVault &&
		path != "/v1/vault" && path != "/v1/move/session" && policy != "registration" && policy != "mailbox" && policy != "approver" {
		return nil, nil, nil, enverrors.New(enverrors.NotFound, "Unknown vault")
	}
	if member == nil && policy == "" {
		return nil, nil, nil, enverrors.New(enverrors.NotMember, "Membership required")
	}
	auth := &shared.Auth{Request: request, Member: member != nil}
	proof := r.Header.Get("Envden-Proof")
	if proof != "" {
		binaryResult5, err := shared.Binary(proof)
		if err != nil {
			return nil, nil, nil, err
		}

		auth.Proof = binaryResult5
	}
	state, err := o.Storage.Device(request.VaultId, request.Device)
	if err != nil {
		return nil, nil, nil, err
	}
	if member != nil && (state == nil || state.ClientVersion != request.ClientVersion) {
		next := adapters.StoredDevice{}
		if state != nil {
			next = *state
		}
		next.ClientVersion = request.ClientVersion
		if err := o.Storage.PutDevice(request.VaultId, request.Device, next); err != nil {
			return nil, nil, nil, err
		}
	}
	if err := verifyMode(o, auth, path); err != nil {
		return nil, nil, nil, err
	}
	if err := AuthorizeBody(o, auth, r); err != nil {
		return nil, nil, nil, err
	}
	if !auth.Member && route.Charge {
		charge, err := authn.Charge(o, auth)
		if err != nil {
			return nil, nil, nil, err
		}

		auth.RateReceipt = charge
	}
	rememberNonce, err := o.Storage.RememberNonce(request.Device, request.Nonce, o.Now())
	if err != nil {
		return nil, nil, nil, err
	}
	if !rememberNonce {
		return nil, nil, nil, enverrors.New(enverrors.Unauthorized, "Replayed request")
	}
	if o.ReserveBody != nil {
		size := int64(0)
		if r.Body != nil && r.Body != http.NoBody {
			declaredBodySize, err := DeclaredBodySize(r, route.Limit)
			if err != nil {
				return nil, nil, nil, err
			}

			size = declaredBodySize *
				2
		}
		kind := "public"
		if auth.Member {
			kind = "member"
		} else if route.Policy == "data" || route.Policy == "registration" {
			kind = "authorized"
		}
		reserved, err := o.ReserveBody(size, kind, request.VaultId, request.Device)
		if err != nil {
			return nil, nil, nil, err
		}
		release = reserved
	}
	body, err := ReadBodyTimed(r, route.Limit, request.BodyHash, BodyTiming{Now: o.Now, Await: o.Await})
	if err != nil {
		return nil, nil, nil, err
	}

	membershipChanged := member != nil
	if membershipChanged {
		membership, err := vaultchain.Membership(o, request.VaultId, request.Device)
		if err != nil {
			return nil, nil, nil, err
		}
		membershipChanged = membership == nil
	}
	if membershipChanged {
		return nil, nil, nil, enverrors.New(enverrors.NotMember, "Membership required")
	}
	finished = true

	return auth, body, release, nil
}

func verifyMode(o shared.Options, auth *shared.Auth, path string) error {
	vault, err := o.Storage.Vault(auth.Request.VaultId)
	if err != nil {
		return err
	}
	if vault == nil {
		return nil
	}
	missingRepairProof := vault.Restored != nil
	if missingRepairProof {
		hasProof, err := authn.HasProof(o, auth, "repair")
		if err != nil {
			return err
		}
		missingRepairProof = !hasProof
	}
	if missingRepairProof {
		return enverrors.New(enverrors.RestoredMode, "Repair required")
	}
	if vault.Restored != nil && !restoredPath.MatchString(path) {
		return enverrors.New(enverrors.RestoredMode, "Repair required")
	}
	if !vault.Active && (!strings.HasPrefix(path, "/v1/move/") && path != "/v1/swap" && !strings.HasPrefix(path, "/v1/blobs/") && !strings.HasPrefix(path, "/v1/opaque/registration/")) {
		return enverrors.New(enverrors.Moving, "Vault moving")
	}

	return nil
}
