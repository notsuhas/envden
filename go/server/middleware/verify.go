package middleware

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	k "github.com/notsuhas/envden/go/core/protocol/keys"
	requests "github.com/notsuhas/envden/go/core/protocol/requests"
	versions "github.com/notsuhas/envden/go/core/protocol/versions"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
	"net/http"
	"strconv"
	"strings"
)

func Verify(o x.Options, r *http.Request) (*x.Auth, []byte, func()) {
	release := func() {}
	finished := false
	defer func() {
		if !finished {
			release()
		}
	}()
	route := RequestRoute(r)
	request := x.Input(func() s.Request { return x.Must(b.Decode(s.RequestCodec, x.Binary(r.Header.Get("Envden-Request")))) })
	signature := x.Binary(r.Header.Get("Envden-Signature"), 64)
	if !bytes.Equal(request.Device, x.Binary(r.Header.Get("Envden-Device"), 16)) || strconv.FormatUint(request.Time, 10) != r.Header.Get("Envden-Time") || !bytes.Equal(request.Nonce, x.Binary(r.Header.Get("Envden-Nonce"), 16)) || request.Method != r.Method || request.PathAndQuery != r.URL.RequestURI() || !bytes.Equal(request.BodyHash, x.Binary(r.Header.Get("Envden-Body-Hash"), 32)) {
		x.Fail(e.Unauthorized, "Request binding mismatch")
	}
	member := v.Membership(o, request.VaultId, request.Device)
	supplied := member
	if supplied == nil {
		record := x.Input(func() members.DeviceRecord {
			return x.Must(b.Decode(members.DeviceRecordCodec, x.Binary(r.Header.Get("Envden-Device-Record"))))
		})
		supplied = &record
	}
	if !bytes.Equal(supplied.Id, request.Device) || !x.Must(requests.VerifyRequestHash(b.Signed[s.Request]{Body: request, Signature: signature}, supplied.ReqPub, x.Must(k.ServerPin(o.ServerKeys.PublicKey)), request.BodyHash, uint64(o.Now()), false)).OK {
		x.Fail(e.Unauthorized, "Invalid request")
	}
	if x.Must(versions.CompareSemver(request.ClientVersion, o.Config.MinClient)) < 0 {
		x.Fail(e.ClientTooOld, "Update required")
	}
	path := r.URL.EscapedPath()
	policy := route.Policy
	if !x.Must(o.Storage.HasVault(request.VaultId)) && path != "/v1/vault" && path != "/v1/move/session" && policy != "registration" && policy != "mailbox" && policy != "approver" {
		x.Fail(e.NotFound, "Unknown vault")
	}
	if member == nil && policy == "" {
		x.Fail(e.NotMember, "Membership required")
	}
	auth := &x.Auth{Request: request, Member: member != nil}
	if proof := r.Header.Get("Envden-Proof"); proof != "" {
		auth.Proof = x.Binary(proof)
	}
	state := x.Must(o.Storage.Device(request.VaultId, request.Device))
	if member != nil && (state == nil || state.ClientVersion != request.ClientVersion) {
		next := a.StoredDevice{}
		if state != nil {
			next = *state
		}
		next.ClientVersion = request.ClientVersion
		x.Check(o.Storage.PutDevice(request.VaultId, request.Device, next))
	}
	verifyMode(o, auth, path)
	AuthorizeBody(o, auth, r)
	if !auth.Member && route.Charge {
		auth.RateReceipt = authn.Charge(o, auth)
	}
	if !x.Must(o.Storage.RememberNonce(request.Device, request.Nonce, o.Now())) {
		x.Fail(e.Unauthorized, "Replayed request")
	}
	if o.ReserveBody != nil {
		size := int64(0)
		if r.Body != nil && r.Body != http.NoBody {
			size = DeclaredBodySize(r, route.Limit) * 2
		}
		kind := "public"
		if auth.Member {
			kind = "member"
		} else if route.Policy == "data" || route.Policy == "registration" {
			kind = "authorized"
		}
		release = o.ReserveBody(size, kind, request.VaultId, request.Device)
	}
	body := ReadBodyTimed(r, route.Limit, request.BodyHash, BodyTiming{Now: o.Now, Await: o.Await})
	if member != nil && v.Membership(o, request.VaultId, request.Device) == nil {
		x.Fail(e.NotMember, "Membership required")
	}
	finished = true
	return auth, body, release
}
func verifyMode(o x.Options, auth *x.Auth, path string) {
	vault := x.Must(o.Storage.Vault(auth.Request.VaultId))
	if vault == nil {
		return
	}
	if vault.Restored != nil && !authn.HasProof(o, auth, "repair") {
		x.Fail(e.RestoredMode, "Repair required")
	}
	if vault.Restored != nil && !restoredPath.MatchString(path) {
		x.Fail(e.RestoredMode, "Repair required")
	}
	if !vault.Active && !(strings.HasPrefix(path, "/v1/move/") || path == "/v1/swap" || strings.HasPrefix(path, "/v1/blobs/") || strings.HasPrefix(path, "/v1/opaque/registration/")) {
		x.Fail(e.Moving, "Vault moving")
	}
}
