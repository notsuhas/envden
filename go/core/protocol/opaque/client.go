package opaque

import (
	o "github.com/bytemare/opaque"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func options() *o.ClientOptions {
	return &o.ClientOptions{KSFSalt: make([]byte, 16), KSFParameters: []uint64{3, 65536, 4}, KSFLength: 64}
}

type RegistrationStart struct{ ClientRegistrationState, RegistrationRequest string }

func OpaqueStartRegistration(password string) (RegistrationStart, error) {
	return attempt(func() RegistrationStart {
		pw := b.Must(b.NormPw(password))
		conf := o.DefaultConfiguration()
		cl := b.Must(conf.Client())
		blind := conf.OPRF.Group().NewScalar().Random()
		req := b.Must(cl.RegistrationInit([]byte(pw), &o.ClientOptions{OPRFBlind: blind})).Serialize()

		return RegistrationStart{text(b.Concat(blind.Encode(), req)), text(req)}
	})
}

type FinishRegistrationParams struct {
	Password, RegistrationResponse, ClientRegistrationState string
	Identifiers                                             Identifiers
	EnvelopeNonce                                           []byte
}
type RegistrationFinish struct{ RegistrationRecord, ExportKey, ServerStaticPublicKey string }

func OpaqueFinishRegistration(p FinishRegistrationParams) (RegistrationFinish, error) {
	return attempt(func() RegistrationFinish {
		checkIdentifiers(p.Identifiers)
		resp := check(p.RegistrationResponse, "registrationResponse")
		state := check(p.ClientRegistrationState, "clientRegistrationState")
		pw := b.Must(b.NormPw(p.Password))
		cl := b.Must(o.DefaultConfiguration().Client())
		opts := options()
		opts.OPRFBlind = b.Must(cl.Deserialize.DecodePrivateKey(state[:32]))
		b.Must(cl.Deserialize.RegistrationRequest(state[32:]))
		opts.ResumePassword = []byte(pw)
		opts.RegistrationEnvelopeNonce = p.EnvelopeNonce
		record, ek, err := cl.RegistrationFinalize(b.Must(cl.Deserialize.RegistrationResponse(resp)), []byte(p.Identifiers.Client), []byte(p.Identifiers.Server), opts)
		if err != nil {
			panic(err)
		}
		return RegistrationFinish{text(record.Serialize()), text(ek), text(resp[32:])}
	})
}

type LoginStart struct{ ClientLoginState, StartLoginRequest string }

func OpaqueStartLogin(password string) (LoginStart, error) {
	return attempt(func() LoginStart {
		pw := b.Must(b.NormPw(password))
		conf := o.DefaultConfiguration()
		cl := b.Must(conf.Client())
		blind := conf.OPRF.Group().NewScalar().Random()
		sk := conf.AKE.Group().NewScalar().Random()
		nonce := o.RandomBytes(32)
		ke1 := b.Must(cl.GenerateKE1([]byte(pw), &o.ClientOptions{OPRFBlind: blind, AKE: &o.AKEOptions{SecretKeyShare: sk, Nonce: nonce}})).Serialize()

		return LoginStart{text(b.Concat(blind.Encode(), ke1, sk.Encode(), nonce)), text(ke1)}
	})
}

type FinishLoginParams struct {
	Password, ClientLoginState, LoginResponse string
	Identifiers                               Identifiers
}
type LoginFinish struct {
	OK                                                               bool
	FinishLoginRequest, SessionKey, ExportKey, ServerStaticPublicKey string
}

func OpaqueFinishLogin(p FinishLoginParams) (LoginFinish, error) {
	return attempt(func() LoginFinish {
		checkIdentifiers(p.Identifiers)
		state := check(p.ClientLoginState, "clientLoginState")
		resp := check(p.LoginResponse, "loginResponse")
		pw := b.Must(b.NormPw(p.Password))
		cl := b.Must(o.DefaultConfiguration().Client())
		opts := options()
		opts.OPRFBlind = b.Must(cl.Deserialize.DecodePrivateKey(state[:32]))
		opts.ResumePassword = []byte(pw)
		opts.ResumeKE1 = state[32:128]
		opts.AKE = &o.AKEOptions{SecretKeyShare: b.Must(cl.Deserialize.DecodePrivateKey(state[128:160]))}
		ke2 := b.Must(cl.Deserialize.KE2(resp))
		ke3, sess, ek, err := cl.GenerateKE3(ke2, []byte(p.Identifiers.Client), []byte(p.Identifiers.Server), opts)
		if err != nil {
			return LoginFinish{}
		}
		return LoginFinish{
			OK:                    true,
			FinishLoginRequest:    text(ke3.Serialize()),
			SessionKey:            text(sess),
			ExportKey:             text(ek),
			ServerStaticPublicKey: text(loginServerPublicKey(pw, state, resp)),
		}
	})
}
