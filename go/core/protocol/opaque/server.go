package opaque

import (
	o "github.com/bytemare/opaque"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func OpaqueCreateSetup() (string, error) {
	return attempt(func() string {
		conf := o.DefaultConfiguration()
		sk := conf.AKE.Group().NewScalar().Random()
		dummy := conf.AKE.Group().Base().Multiply(conf.AKE.Group().NewScalar().Random())

		return text(b.Concat(o.RandomBytes(64), sk.Encode(), dummy.Encode()))
	})
}

func server(setup []byte) *o.Server {
	conf := o.DefaultConfiguration()
	s := b.Must(conf.Server())
	sk := b.Must(s.Deserialize.DecodePrivateKey(setup[64:96]))
	_, err := s.Deserialize.DecodePublicKey(setup[96:])
	if err != nil {
		panic(err)
	}
	if err := s.SetKeyMaterial(&o.ServerKeyMaterial{PrivateKey: sk, PublicKeyBytes: conf.AKE.Group().Base().Multiply(sk).Encode(), OPRFGlobalSeed: setup[:64]}); err != nil {
		panic(err)
	}
	return s
}

type RegistrationResponseParams struct{ ServerSetup, UserIdentifier, RegistrationRequest string }
type RegistrationResponse struct{ RegistrationResponse string }

func OpaqueRegistrationResponse(p RegistrationResponseParams) (RegistrationResponse, error) {
	return attempt(func() RegistrationResponse {
		checkUserIdentifier(p.UserIdentifier)
		setup := check(p.ServerSetup, "serverSetup")
		req := check(p.RegistrationRequest, "registrationRequest")
		s := server(setup)
		resp := b.Must(s.RegistrationResponse(b.Must(s.Deserialize.RegistrationRequest(req)), []byte(p.UserIdentifier), nil))

		return RegistrationResponse{text(resp.Serialize())}
	})
}

type ServerStartLoginParams struct {
	ServerSetup, UserIdentifier string
	Identifiers                 Identifiers
	RegistrationRecord          *string
	StartLoginRequest           string
}
type ServerLoginStart struct{ ServerLoginState, LoginResponse string }

func OpaqueServerStartLogin(p ServerStartLoginParams) (ServerLoginStart, error) {
	return attempt(func() ServerLoginStart {
		checkUserIdentifier(p.UserIdentifier)
		setup := check(p.ServerSetup, "serverSetup")
		checkIdentifiers(p.Identifiers)
		var record []byte
		if p.RegistrationRecord != nil {
			record = check(*p.RegistrationRecord, "registrationRecord")
		}
		req := check(p.StartLoginRequest, "startLoginRequest")
		s := server(setup)
		if record == nil {
			record = b.Concat(setup[96:], o.RandomBytes(64), make([]byte, 96))
		}
		s.ServerKeyMaterial.Identity = []byte(p.Identifiers.Server)
		r := b.Must(s.Deserialize.RegistrationRecord(record))
		ke2, out, err := s.GenerateKE2(b.Must(s.Deserialize.KE1(req)), &o.ClientRecord{RegistrationRecord: r, CredentialIdentifier: []byte(p.UserIdentifier), ClientIdentity: []byte(p.Identifiers.Client)})
		if err != nil {
			panic(err)
		}
		return ServerLoginStart{text(b.Concat(out.SessionSecret, out.ClientMAC)), text(ke2.Serialize())}
	})
}

type ServerFinishLoginParams struct {
	Identifiers                          Identifiers
	ServerLoginState, FinishLoginRequest string
}
type ServerLoginFinish struct{ SessionKey string }

func OpaqueServerFinishLogin(p ServerFinishLoginParams) (ServerLoginFinish, error) {
	return attempt(func() ServerLoginFinish {
		checkIdentifiers(p.Identifiers)
		state := check(p.ServerLoginState, "serverLoginState")
		req := check(p.FinishLoginRequest, "finishLoginRequest")
		s := b.Must(o.DefaultConfiguration().Server())
		if err := s.LoginFinish(b.Must(s.Deserialize.KE3(req)), state[64:]); err != nil {
			panic(err)
		}
		return ServerLoginFinish{text(state[:64])}
	})
}
