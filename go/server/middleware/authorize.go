package middleware

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	access "github.com/notsuhas/envden/go/server/access"
	authn "github.com/notsuhas/envden/go/server/auth"
	pairing "github.com/notsuhas/envden/go/server/pairing"
	x "github.com/notsuhas/envden/go/server/shared"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

var restoredPath = regexp.MustCompile(`^/v1/(repair/|swap$|blobs(?:/|$)|headers$|entries$|head$|files/|keyrings/|envelope$|opaque/)`)
var objectPath = regexp.MustCompile(`^/v1/(files|keyrings|blobs)/([^/]+)$`)

func AuthorizeBody(o x.Options, auth *x.Auth, r *http.Request) {
	path := r.URL.EscapedPath()
	vault := x.Must(o.Storage.Vault(auth.Request.VaultId))
	if !auth.Member {
		if path == "/v1/opaque/login/finish" && x.Must(o.Storage.Session(auth.Request.VaultId, a.SessionKey{Kind: a.SessionLogin, Device: auth.Request.Device, Purpose: "kit"}, o.Now())) == nil {
			x.Fail(e.Unauthorized, "Login expired or consumed")
		}
		if r.Method == "GET" {
			authorizeRead(o, auth, path)
		}
	}
	switch {
	case strings.HasPrefix(path, "/v1/opaque/registration/"):
		authn.AuthorizeRegistration(o, auth)
	case path == "/v1/vault" && (vault == nil || !auth.Member):
		requireSetup(o, auth)
	case strings.HasPrefix(path, "/v1/move/"):
		switch {
		case path == "/v1/move/session" && !x.Must(o.Storage.HasVault(auth.Request.VaultId)):
			requireSetup(o, auth)
		case path == "/v1/move/freeze" || path == "/v1/move/unfreeze" || path == "/v1/move/sk-pub" || path == "/v1/move/period" && r.Method == "GET":
			authn.RequireGate(o, auth, "fresh")
		default:
			authn.RequireMove(o, auth)
		}
	case strings.HasPrefix(path, "/v1/repair/"):
		authn.RequireRepair(o, auth)
	case strings.HasPrefix(path, "/v1/blobs/") && r.Method == "PUT":
		if vault != nil && vault.Restored != nil {
			authn.RequireRepair(o, auth)
		} else if vault != nil && !vault.Active {
			authn.RequireMove(o, auth)
		} else {
			authn.RequireGate(o, auth, "unlocked")
		}
	case !auth.Member && path == "/v1/swap":
		authn.RequireJoinTicket(o, auth)
	case path == "/v1/settings/unlock-period" && r.Method == "PUT" || path == "/v1/pairing/mailboxes":
		authn.RequireGate(o, auth, "fresh")
	case r.Method == "PUT" && strings.HasPrefix(path, "/v1/pairing/mailboxes/"):
		parts := strings.Split(path, "/")
		if len(parts) > 5 && validSlot(parts[5]) {
			n, _ := strconv.Atoi(parts[4])
			pairing.Charge(o, auth, n, func() { pairing.Accessible(o, auth, n, a.MailboxSlot(parts[5]), true) })
		}
	}
}
func requireSetup(o x.Options, auth *x.Auth) {
	if !authn.HasProof(o, auth, "setup") {
		x.Fail(e.Unauthorized, "Setup proof required")
	}
}
func validSlot(s string) bool { return s == "KE1" || s == "KE2" || s == "KE3" || s == "PairJoiner" }
func authorizeRead(o x.Options, auth *x.Auth, path string) {
	if path == "/v1/head" || path == "/v1/headers" || path == "/v1/entries" || path == "/v1/envelope" {
		kind := "history"
		if path == "/v1/envelope" {
			kind = "envelope"
		}
		access.RequireRead(o, auth, kind, nil)
	}
	if match := objectPath.FindStringSubmatch(path); match != nil {
		kind := "blob"
		if match[1] == "files" {
			kind = "files"
		} else if match[1] == "keyrings" {
			kind = "keyring"
		}
		access.RequireRead(o, auth, kind, x.Binary(match[2], 32))
	}
	if path == "/v1/pairing/approver" {
		pairing.Approver(o, auth)
	}
	parts := strings.Split(path, "/")
	if strings.HasPrefix(path, "/v1/pairing/mailboxes/") && len(parts) > 5 && validSlot(parts[5]) {
		n, _ := strconv.Atoi(parts[4])
		pairing.Accessible(o, auth, n, a.MailboxSlot(parts[5]), false)
	}
}
