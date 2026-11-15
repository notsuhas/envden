package server

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/pairing"
	"github.com/notsuhas/envden/go/server/shared"
)

func (app *App) route(w http.ResponseWriter, r *http.Request, auth *shared.Auth, body []byte) (bool, error) {
	o := app.options
	path := r.URL.EscapedPath()
	var result any
	switch r.Method + " " + path {
	case "POST /v1/opaque/login/start":
		parse, err := shared.Parse(wire.LoginStartSchema, body)
		if err != nil {
			return false, err
		}

		v := parse
		startLogin, err := authn.StartLogin(o, auth, v.Purpose, v.Message)
		if err != nil {
			return false, err
		}

		result = startLogin

	case "POST /v1/opaque/login/finish":
		parseResult, err := shared.Parse(wire.LoginFinishSchema, body)
		if err != nil {
			return false, err
		}

		v := parseResult
		finishLogin, err := authn.FinishLogin(o, auth, v.Purpose, v.Message)
		if err != nil {
			return false, err
		}

		result = finishLogin

	case "POST /v1/opaque/registration/start":
		parseResult2, err := shared.Parse(wire.RegistrationStartSchema, body)
		if err != nil {
			return false, err
		}

		v := parseResult2
		startRegistration, err := authn.StartRegistration(o, auth, v.Message)
		if err != nil {
			return false, err
		}

		result = startRegistration

	case "POST /v1/opaque/registration/finish":
		parseResult3, err := shared.Parse(wire.RegistrationFinishSchema, body)
		if err != nil {
			return false, err
		}

		v := parseResult3
		finishRegistration, err := authn.FinishRegistration(o, auth, v.Message)
		if err != nil {
			return false, err
		}

		result = finishRegistration

	case "GET /v1/settings/unlock-period":
		err := authn.RequireGate(o, auth, "unlocked")
		if err != nil {
			return false, err
		}
		vault, err := o.Storage.Vault(auth.Request.VaultId)
		if err != nil {
			return false, err
		}

		result = wire.UnlockPeriod{Period: vault.UnlockPeriod}
	case "GET /v1/unlock-window":
		err := authn.RequireGate(o, auth, "unlocked")
		if err != nil {
			return false, err
		}
		unlockWindow, err := authn.UnlockWindow(o, auth.Request.VaultId, auth.Request.Device)
		if err != nil {
			return false, err
		}

		result = unlockWindow

	case "PUT /v1/settings/unlock-period":
		err := authn.RequireGate(o, auth, "fresh")
		if err != nil {
			return false, err
		}
		parseResult4, err := shared.Parse(wire.UnlockPeriodSchema, body)
		if err != nil {
			return false, err
		}

		v := parseResult4
		setUnlockPeriod, err := authn.SetUnlockPeriod(o, auth, v.Period)
		if err != nil {
			return false, err
		}

		result = setUnlockPeriod

	case "POST /v1/pairing/mailboxes":
		err := authn.RequireGate(o, auth, "fresh")
		if err != nil {
			return false, err
		}
		open, err := pairing.Open(o, auth)
		if err != nil {
			return false, err
		}

		result = open

	case "GET /v1/pairing/approver":
		approver, err := pairing.Approver(o, auth)
		if err != nil {
			return false, err
		}

		result = approver

	default:
		if strings.HasPrefix(path, "/v1/pairing/mailboxes/") {
			parts := strings.Split(path, "/")
			n, err := strconv.Atoi(parts[4])
			if err != nil {
				return false, err
			}
			if r.Method == "DELETE" && len(parts) == 5 {
				close, err := pairing.Close(o, auth, n)
				if err != nil {
					return false, err
				}

				result = close
			} else if len(parts) == 6 {
				slot := adapters.MailboxSlot(parts[5])
				switch r.Method {
				case "GET":
					read, err := pairing.Read(o, auth, n, slot)
					if err != nil {
						return false, err
					}

					result = read

				case "PUT":
					parseResult5, err := shared.Parse(wire.MailboxWriteSchema, body)
					if err != nil {
						return false, err
					}

					v := parseResult5
					write, err := pairing.Write(o, auth, n, slot, v.Message)
					if err != nil {
						return false, err
					}

					result = write
				}
			}
		}
		if result == nil {
			return app.dataRoute(w, r, auth, body)
		}
	}
	if err := app.json(w, r, result, 200); err != nil {
		return false, err
	}

	return true, nil
}
