package server

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	authn "github.com/notsuhas/envden/go/server/auth"
	pairing "github.com/notsuhas/envden/go/server/pairing"
	x "github.com/notsuhas/envden/go/server/shared"
	"net/http"
	"strconv"
	"strings"
)

func (app *App) route(w http.ResponseWriter, r *http.Request, auth *x.Auth, body []byte) bool {
	o := app.options
	path := r.URL.EscapedPath()
	var result any
	switch r.Method + " " + path {
	case "POST /v1/opaque/login/start":
		v := x.Parse(s.LoginStartSchema, body)
		result = authn.StartLogin(o, auth, v.Purpose, v.Message)
	case "POST /v1/opaque/login/finish":
		v := x.Parse(s.LoginFinishSchema, body)
		result = authn.FinishLogin(o, auth, v.Purpose, v.Message)
	case "POST /v1/opaque/registration/start":
		v := x.Parse(s.RegistrationStartSchema, body)
		result = authn.StartRegistration(o, auth, v.Message)
	case "POST /v1/opaque/registration/finish":
		v := x.Parse(s.RegistrationFinishSchema, body)
		result = authn.FinishRegistration(o, auth, v.Message)
	case "GET /v1/settings/unlock-period":
		authn.RequireGate(o, auth, "unlocked")
		result = s.UnlockPeriod{Period: x.Must(o.Storage.Vault(auth.Request.VaultId)).UnlockPeriod}
	case "GET /v1/unlock-window":
		authn.RequireGate(o, auth, "unlocked")
		result = authn.UnlockWindow(o, auth.Request.VaultId, auth.Request.Device)
	case "PUT /v1/settings/unlock-period":
		authn.RequireGate(o, auth, "fresh")
		v := x.Parse(s.UnlockPeriodSchema, body)
		result = authn.SetUnlockPeriod(o, auth, v.Period)
	case "POST /v1/pairing/mailboxes":
		authn.RequireGate(o, auth, "fresh")
		result = pairing.Open(o, auth)
	case "GET /v1/pairing/approver":
		result = pairing.Approver(o, auth)
	default:
		if strings.HasPrefix(path, "/v1/pairing/mailboxes/") {
			parts := strings.Split(path, "/")
			n := x.Must(strconv.Atoi(parts[4]))
			if r.Method == "DELETE" && len(parts) == 5 {
				result = pairing.Close(o, auth, n)
			} else if len(parts) == 6 {
				slot := a.MailboxSlot(parts[5])
				if r.Method == "GET" {
					result = pairing.Read(o, auth, n, slot)
				} else if r.Method == "PUT" {
					v := x.Parse(s.MailboxWriteSchema, body)
					result = pairing.Write(o, auth, n, slot, v.Message)
				}
			}
		}
		if result == nil {
			return app.dataRoute(w, r, auth, body)
		}
	}
	app.json(w, r, result, 200)
	return true
}
