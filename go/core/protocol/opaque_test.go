package protocol_test

import (
	"encoding/base64"
	"testing"

	o "github.com/notsuhas/envden/go/core/protocol/opaque"
)

type opaqueVector struct {
	Ids                 o.IdentityContext
	Registration, Login map[string]string
}

func TestOpaqueVectors(t *testing.T) {
	for _, tc := range []struct{ file, password string }{{"opaque", "password"}, {"pairing", "01234567"}} {
		t.Run(tc.file, func(t *testing.T) {
			v := load[opaqueVector](t, tc.file)
			r, l := v.Registration, v.Login
			response := must(o.OpaqueRegistrationResponse(o.RegistrationResponseParams{ServerSetup: r["serverSetup"], UserIdentifier: v.Ids.UserIdentifier, RegistrationRequest: r["registrationRequest"]}))
			eq(t, response.RegistrationResponse, r["registrationResponse"])
			record := must(base64.RawURLEncoding.DecodeString(r["registrationRecord"]))
			reg := must(o.OpaqueFinishRegistration(o.FinishRegistrationParams{Password: tc.password, RegistrationResponse: r["registrationResponse"], ClientRegistrationState: r["clientRegistrationState"], Identifiers: v.Ids.Identifiers, EnvelopeNonce: record[96:128]}))
			eq(t, reg.RegistrationRecord, r["registrationRecord"])
			eq(t, reg.ExportKey, r["exportKey"])
			eq(t, reg.ServerStaticPublicKey, r["serverStaticPublicKey"])
			p := o.FinishLoginParams{Password: tc.password, ClientLoginState: l["clientLoginState"], LoginResponse: l["loginResponse"], Identifiers: v.Ids.Identifiers}
			login := must(o.OpaqueFinishLogin(p))
			eq(t, login.OK, true)
			eq(t, login.SessionKey, l["sessionKey"])
			eq(t, login.ExportKey, l["exportKey"])
			eq(t, login.FinishLoginRequest, l["finishLoginRequest"])
			eq(t, login.ServerStaticPublicKey, l["serverStaticPublicKey"])
			server := must(o.OpaqueServerFinishLogin(o.ServerFinishLoginParams{Identifiers: v.Ids.Identifiers, ServerLoginState: l["serverLoginState"], FinishLoginRequest: l["finishLoginRequest"]}))
			eq(t, server.SessionKey, login.SessionKey)
			p.Password = "wrong"
			eq(t, must(o.OpaqueFinishLogin(p)).OK, false)
		})
	}
}

func TestOpaqueFreshExchangeAndMissingRecord(t *testing.T) {
	ids := must(o.UnlockIdentifiers(make([]byte, 32)))
	setup := must(o.OpaqueCreateSetup())
	a := must(o.OpaqueStartRegistration(" Ａ "))
	resp := must(o.OpaqueRegistrationResponse(o.RegistrationResponseParams{ServerSetup: setup, UserIdentifier: ids.UserIdentifier, RegistrationRequest: a.RegistrationRequest}))
	reg := must(o.OpaqueFinishRegistration(o.FinishRegistrationParams{Password: " A ", RegistrationResponse: resp.RegistrationResponse, ClientRegistrationState: a.ClientRegistrationState, Identifiers: ids.Identifiers}))
	for _, missing := range []bool{false, true} {
		start := must(o.OpaqueStartLogin(" A "))
		p := o.ServerStartLoginParams{ServerSetup: setup, UserIdentifier: ids.UserIdentifier, Identifiers: ids.Identifiers, StartLoginRequest: start.StartLoginRequest}
		if !missing {
			p.RegistrationRecord = &reg.RegistrationRecord
		}
		server := must(o.OpaqueServerStartLogin(p))
		login := must(o.OpaqueFinishLogin(o.FinishLoginParams{Password: " A ", ClientLoginState: start.ClientLoginState, LoginResponse: server.LoginResponse, Identifiers: ids.Identifiers}))
		eq(t, login.OK, !missing)
		if missing {
			continue
		}
		eq(t, login.ExportKey, reg.ExportKey)
		finished := must(o.OpaqueServerFinishLogin(o.ServerFinishLoginParams{Identifiers: ids.Identifiers, ServerLoginState: server.ServerLoginState, FinishLoginRequest: login.FinishLoginRequest}))
		eq(t, finished.SessionKey, login.SessionKey)
	}
}

func TestOpaqueShapeAndContextChecks(t *testing.T) {
	v := load[opaqueVector](t, "opaque")
	r, l := v.Registration, v.Login
	ids := v.Ids.Identifiers
	for _, value := range []string{"!", "AA=", "AB", "AAAA"} {
		_, err := o.OpaqueMessage(value, 1)
		reject(t, err)
		_, err = o.OpaqueServerFinishLogin(o.ServerFinishLoginParams{Identifiers: ids, ServerLoginState: value, FinishLoginRequest: l["finishLoginRequest"]})
		reject(t, err)
	}
	eq(t, must(o.UnlockIdentifiers(make([]byte, 32))).Identifiers.Server, "envden/v1/unlock-server")
	eq(t, must(o.PairingIdentifiers(make([]byte, 32), 1)).Identifiers.Client, "envden/v1/pair/joiner")
	for _, bad := range []int{0, 1000} {
		_, err := o.PairingIdentifiers(make([]byte, 32), bad)
		reject(t, err)
	}
	for _, missing := range []bool{false, true} {
		ctx := ids
		if missing {
			ctx = o.Identifiers{}
		}
		for field := 0; field < 2; field++ {
			p := o.RegistrationResponseParams{ServerSetup: r["serverSetup"], UserIdentifier: "x", RegistrationRequest: r["registrationRequest"]}
			if missing {
				p.UserIdentifier = ""
			} else if field == 0 {
				p.ServerSetup = "AA"
			} else {
				p.RegistrationRequest = "AA"
			}
			_, err := o.OpaqueRegistrationResponse(p)
			reject(t, err)
			q := o.FinishRegistrationParams{Identifiers: ctx, Password: "x", RegistrationResponse: r["registrationResponse"], ClientRegistrationState: r["clientRegistrationState"]}
			if !missing {
				if field == 0 {
					q.RegistrationResponse = "AA"
				} else {
					q.ClientRegistrationState = "AA"
				}
			}
			_, err = o.OpaqueFinishRegistration(q)
			reject(t, err)
			record := r["registrationRecord"]
			p2 := o.ServerStartLoginParams{Identifiers: ctx, ServerSetup: r["serverSetup"], UserIdentifier: "x", RegistrationRecord: &record, StartLoginRequest: l["startLoginRequest"]}
			if !missing {
				if field == 0 {
					bad := "AA"
					p2.RegistrationRecord = &bad
				} else {
					p2.StartLoginRequest = "AA"
				}
			}
			_, err = o.OpaqueServerStartLogin(p2)
			reject(t, err)
			q2 := o.FinishLoginParams{Identifiers: ctx, Password: "x", ClientLoginState: l["clientLoginState"], LoginResponse: l["loginResponse"]}
			if !missing {
				if field == 0 {
					q2.ClientLoginState = "AA"
				} else {
					q2.LoginResponse = "AA"
				}
			}
			_, err = o.OpaqueFinishLogin(q2)
			reject(t, err)
			q3 := o.ServerFinishLoginParams{Identifiers: ctx, ServerLoginState: l["serverLoginState"], FinishLoginRequest: l["finishLoginRequest"]}
			if !missing {
				q3.FinishLoginRequest = "AA"
			}
			_, err = o.OpaqueServerFinishLogin(q3)
			reject(t, err)
		}
	}
}
