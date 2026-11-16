package protocol_test

import (
	"encoding/base64"
	"testing"

	"github.com/notsuhas/envden/go/core/protocol/opaque"
)

type opaqueVector struct {
	Ids                 opaque.IdentityContext
	Registration, Login map[string]string
}

func TestOpaqueVectors(t *testing.T) {
	for _, tc := range []struct{ file, password string }{{"opaque", "password"}, {"pairing", "01234567"}} {
		t.Run(tc.file, func(t *testing.T) {
			v := load[opaqueVector](t, tc.file)
			r, l := v.Registration, v.Login
			response := must(opaque.OpaqueRegistrationResponse(opaque.RegistrationResponseParams{ServerSetup: r["serverSetup"], UserIdentifier: v.Ids.UserIdentifier, RegistrationRequest: r["registrationRequest"]}))
			eq(t, response.RegistrationResponse, r["registrationResponse"])
			record := must(base64.RawURLEncoding.DecodeString(r["registrationRecord"]))
			reg := must(opaque.OpaqueFinishRegistration(opaque.FinishRegistrationParams{Password: tc.password, RegistrationResponse: r["registrationResponse"], ClientRegistrationState: r["clientRegistrationState"], Identifiers: v.Ids.Identifiers, EnvelopeNonce: record[96:128]}))
			eq(t, reg.RegistrationRecord, r["registrationRecord"])
			eq(t, reg.ExportKey, r["exportKey"])
			eq(t, reg.ServerStaticPublicKey, r["serverStaticPublicKey"])
			p := opaque.FinishLoginParams{Password: tc.password, ClientLoginState: l["clientLoginState"], LoginResponse: l["loginResponse"], Identifiers: v.Ids.Identifiers}
			login := must(opaque.OpaqueFinishLogin(p))
			eq(t, login.OK, true)
			eq(t, login.SessionKey, l["sessionKey"])
			eq(t, login.ExportKey, l["exportKey"])
			eq(t, login.FinishLoginRequest, l["finishLoginRequest"])
			server := must(opaque.OpaqueServerFinishLogin(opaque.ServerFinishLoginParams{Identifiers: v.Ids.Identifiers, ServerLoginState: l["serverLoginState"], FinishLoginRequest: l["finishLoginRequest"]}))
			eq(t, server.SessionKey, login.SessionKey)
			p.Password = "wrong"
			eq(t, must(opaque.OpaqueFinishLogin(p)).OK, false)
		})
	}
}

func TestOpaqueFreshExchangeAndMissingRecord(t *testing.T) {
	ids := must(opaque.UnlockIdentifiers(make([]byte, 32)))
	setup := must(opaque.OpaqueCreateSetup())
	a := must(opaque.OpaqueStartRegistration(" Ａ "))
	resp := must(opaque.OpaqueRegistrationResponse(opaque.RegistrationResponseParams{ServerSetup: setup, UserIdentifier: ids.UserIdentifier, RegistrationRequest: a.RegistrationRequest}))
	reg := must(opaque.OpaqueFinishRegistration(opaque.FinishRegistrationParams{Password: " A ", RegistrationResponse: resp.RegistrationResponse, ClientRegistrationState: a.ClientRegistrationState, Identifiers: ids.Identifiers}))
	for _, missing := range []bool{false, true} {
		start := must(opaque.OpaqueStartLogin(" A "))
		p := opaque.ServerStartLoginParams{ServerSetup: setup, UserIdentifier: ids.UserIdentifier, Identifiers: ids.Identifiers, StartLoginRequest: start.StartLoginRequest}
		if !missing {
			p.RegistrationRecord = &reg.RegistrationRecord
		}
		server := must(opaque.OpaqueServerStartLogin(p))
		login := must(opaque.OpaqueFinishLogin(opaque.FinishLoginParams{Password: " A ", ClientLoginState: start.ClientLoginState, LoginResponse: server.LoginResponse, Identifiers: ids.Identifiers}))
		eq(t, login.OK, !missing)
		if missing {
			continue
		}
		eq(t, login.ExportKey, reg.ExportKey)
		finished := must(opaque.OpaqueServerFinishLogin(opaque.ServerFinishLoginParams{Identifiers: ids.Identifiers, ServerLoginState: server.ServerLoginState, FinishLoginRequest: login.FinishLoginRequest}))
		eq(t, finished.SessionKey, login.SessionKey)
	}
}

func TestOpaqueShapeAndContextChecks(t *testing.T) {
	v := load[opaqueVector](t, "opaque")
	r, l := v.Registration, v.Login
	ids := v.Ids.Identifiers
	for _, value := range []string{"!", "AA=", "AB", "AAAA"} {
		_, err := opaque.OpaqueMessage(value, 1)
		reject(t, err)
		_, err = opaque.OpaqueServerFinishLogin(opaque.ServerFinishLoginParams{Identifiers: ids, ServerLoginState: value, FinishLoginRequest: l["finishLoginRequest"]})
		reject(t, err)
	}
	eq(t, must(opaque.UnlockIdentifiers(make([]byte, 32))).Identifiers.Server, "envden/v1/unlock-server")
	eq(t, must(opaque.PairingIdentifiers(make([]byte, 32), 1)).Identifiers.Client, "envden/v1/pair/joiner")
	for _, bad := range []int{0, 1000} {
		_, err := opaque.PairingIdentifiers(make([]byte, 32), bad)
		reject(t, err)
	}
	for _, missing := range []bool{false, true} {
		ctx := ids
		if missing {
			ctx = opaque.Identifiers{}
		}
		for field := 0; field < 2; field++ {
			p := opaque.RegistrationResponseParams{ServerSetup: r["serverSetup"], UserIdentifier: "x", RegistrationRequest: r["registrationRequest"]}
			if missing {
				p.UserIdentifier = ""
			} else if field == 0 {
				p.ServerSetup = "AA"
			} else {
				p.RegistrationRequest = "AA"
			}
			_, err := opaque.OpaqueRegistrationResponse(p)
			reject(t, err)
			q := opaque.FinishRegistrationParams{Identifiers: ctx, Password: "x", RegistrationResponse: r["registrationResponse"], ClientRegistrationState: r["clientRegistrationState"]}
			if !missing {
				if field == 0 {
					q.RegistrationResponse = "AA"
				} else {
					q.ClientRegistrationState = "AA"
				}
			}
			_, err = opaque.OpaqueFinishRegistration(q)
			reject(t, err)
			record := r["registrationRecord"]
			p2 := opaque.ServerStartLoginParams{Identifiers: ctx, ServerSetup: r["serverSetup"], UserIdentifier: "x", RegistrationRecord: &record, StartLoginRequest: l["startLoginRequest"]}
			if !missing {
				if field == 0 {
					bad := "AA"
					p2.RegistrationRecord = &bad
				} else {
					p2.StartLoginRequest = "AA"
				}
			}
			_, err = opaque.OpaqueServerStartLogin(p2)
			reject(t, err)
			q2 := opaque.FinishLoginParams{Identifiers: ctx, Password: "x", ClientLoginState: l["clientLoginState"], LoginResponse: l["loginResponse"]}
			if !missing {
				if field == 0 {
					q2.ClientLoginState = "AA"
				} else {
					q2.LoginResponse = "AA"
				}
			}
			_, err = opaque.OpaqueFinishLogin(q2)
			reject(t, err)
			q3 := opaque.ServerFinishLoginParams{Identifiers: ctx, ServerLoginState: l["serverLoginState"], FinishLoginRequest: l["finishLoginRequest"]}
			if !missing {
				q3.FinishLoginRequest = "AA"
			}
			_, err = opaque.OpaqueServerFinishLogin(q3)
			reject(t, err)
		}
	}
}
