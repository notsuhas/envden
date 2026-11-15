package middleware

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/server/access"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/pairing"
	"github.com/notsuhas/envden/go/server/shared"
)

var restoredPath = regexp.MustCompile(`^/v1/(repair/|swap$|blobs(?:/|$)|headers$|entries$|head$|files/|keyrings/|envelope$|opaque/)`)

var objectPath = regexp.MustCompile(`^/v1/(files|keyrings|blobs)/([^/]+)$`)

func AuthorizeBody(o shared.Options, auth *shared.Auth, r *http.Request) error {
	path := r.URL.EscapedPath()
	vault, err := o.Storage.Vault(auth.Request.VaultId)
	if err != nil {
		return err
	}
	if !auth.Member {
		repairLogin := path == "/v1/opaque/login/finish"
		if repairLogin {
			session, err := o.Storage.Session(auth.Request.VaultId, adapters.SessionKey{Kind: adapters.SessionLogin, Device: auth.Request.Device, Purpose: "kit"}, o.Now())
			if err != nil {
				return err
			}
			repairLogin = session == nil
		}
		if repairLogin {
			return enverrors.New(enverrors.Unauthorized, "Login expired or consumed")
		}
		if r.Method == "GET" {
			if err := authorizeRead(o, auth, path); err != nil {
				return err
			}
		}
	}
	switch {
	case strings.HasPrefix(path, "/v1/opaque/registration/"):
		err := authn.AuthorizeRegistration(o, auth)
		if err != nil {
			return err
		}

	case path == "/v1/vault" && (vault == nil || !auth.Member):
		err := requireSetup(o, auth)
		if err != nil {
			return err
		}

	case strings.HasPrefix(path, "/v1/move/"):
		hasVault := true
		if path == "/v1/move/session" {
			var err error
			hasVault, err = o.Storage.HasVault(auth.Request.VaultId)
			if err != nil {
				return err
			}
		}
		switch {
		case path == "/v1/move/session" && !hasVault:
			err := requireSetup(o, auth)
			if err != nil {
				return err
			}

		case path == "/v1/move/freeze" || path == "/v1/move/unfreeze" || path == "/v1/move/sk-pub" || path == "/v1/move/period" && r.Method == "GET":
			err := authn.RequireGate(o, auth, "fresh")
			if err != nil {
				return err
			}

		default:
			err := authn.RequireMove(o, auth)
			if err != nil {
				return err
			}
		}
	case strings.HasPrefix(path, "/v1/repair/"):
		err := authn.RequireRepair(o, auth)
		if err != nil {
			return err
		}

	case strings.HasPrefix(path, "/v1/blobs/") && r.Method == "PUT":
		if vault != nil && vault.Restored != nil {
			if err := authn.RequireRepair(o, auth); err != nil {
				return err
			}
		} else if vault != nil && !vault.Active {
			if err := authn.RequireMove(o, auth); err != nil {
				return err
			}
		} else {
			if err := authn.RequireGate(o, auth, "unlocked"); err != nil {
				return err
			}
		}
	case !auth.Member && path == "/v1/swap":
		err := authn.RequireJoinTicket(o, auth)
		if err != nil {
			return err
		}

	case path == "/v1/settings/unlock-period" && r.Method == "PUT" || path == "/v1/pairing/mailboxes":
		err := authn.RequireGate(o, auth, "fresh")
		if err != nil {
			return err
		}

	case r.Method == "PUT" && strings.HasPrefix(path, "/v1/pairing/mailboxes/"):
		parts := strings.Split(path, "/")
		if len(parts) > 5 && validSlot(parts[5]) {
			n, _ := strconv.Atoi(parts[4])
			if err := pairing.Charge(o, auth, n, func() error {
				if _, err := pairing.Accessible(o, auth, n, adapters.MailboxSlot(parts[5]), true); err != nil {
					return err
				}

				return nil
			}); err != nil {
				return err
			}
		}
	}

	return nil
}

func requireSetup(o shared.Options, auth *shared.Auth) error {
	hasProof, err := authn.HasProof(o, auth, "setup")
	if err != nil {
		return err
	}
	if !hasProof {
		return enverrors.New(enverrors.Unauthorized, "Setup proof required")
	}

	return nil
}

func validSlot(s string) bool { return s == "KE1" || s == "KE2" || s == "KE3" || s == "PairJoiner" }

func authorizeRead(o shared.Options, auth *shared.Auth, path string) error {
	if path == "/v1/head" || path == "/v1/headers" || path == "/v1/entries" || path == "/v1/envelope" {
		kind := "history"
		if path == "/v1/envelope" {
			kind = "envelope"
		}
		if err := access.RequireRead(o, auth, kind, nil); err != nil {
			return err
		}
	}
	match := objectPath.FindStringSubmatch(path)
	if match != nil {
		kind := "blob"
		switch match[1] {
		case "files":
			kind = "files"
		case "keyrings":
			kind = "keyring"
		}
		binary, err := shared.Binary(match[2], 32)
		if err != nil {
			return err
		}
		if err := access.RequireRead(o, auth, kind, binary); err != nil {
			return err
		}
	}
	if path == "/v1/pairing/approver" {
		if _, err := pairing.Approver(o, auth); err != nil {
			return err
		}
	}
	parts := strings.Split(path, "/")
	if strings.HasPrefix(path, "/v1/pairing/mailboxes/") && len(parts) > 5 && validSlot(parts[5]) {
		n, _ := strconv.Atoi(parts[4])
		if _, err := pairing.Accessible(o, auth, n, adapters.MailboxSlot(parts[5]), false); err != nil {
			return err
		}
	}

	return nil
}
