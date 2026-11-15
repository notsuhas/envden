package pairing

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	p "github.com/notsuhas/envden/go/core/protocol/pairing"
)

type Local struct {
	Code   string
	Answer func(string) (opaque.ServerLoginStart, error)
}

func PreparePairing(pin []byte, mailbox int) (Local, error) {
	return b.Try(func() Local {
		code := b.Must(p.GeneratePairingCode(mailbox))
		normalized := b.Must(p.NormalizePairingCode(code))
		setup := b.Must(opaque.OpaqueCreateSetup())
		ids := b.Must(opaque.PairingIdentifiers(pin, mailbox))
		start := b.Must(opaque.OpaqueStartRegistration(normalized.Password))
		response := b.Must(opaque.OpaqueRegistrationResponse(opaque.RegistrationResponseParams{ServerSetup: setup, UserIdentifier: ids.UserIdentifier, RegistrationRequest: start.RegistrationRequest}))
		finish := b.Must(opaque.OpaqueFinishRegistration(opaque.FinishRegistrationParams{Password: normalized.Password, RegistrationResponse: response.RegistrationResponse, ClientRegistrationState: start.ClientRegistrationState, Identifiers: ids.Identifiers}))
		used := false
		return Local{code, func(message string) (opaque.ServerLoginStart, error) {
			if used {
				return opaque.ServerLoginStart{}, errors.New(errors.Unauthorized, "Pairing code already used")
			}
			used = true
			return opaque.OpaqueServerStartLogin(opaque.ServerStartLoginParams{ServerSetup: setup, UserIdentifier: ids.UserIdentifier, Identifiers: ids.Identifiers, RegistrationRecord: &finish.RegistrationRecord, StartLoginRequest: message})
		}}
	})
}

func FinishApprover(pin []byte, mailbox int, state, message string) (p.ChannelKeys, error) {
	ids, err := opaque.PairingIdentifiers(pin, mailbox)
	if err != nil {
		return p.ChannelKeys{}, err
	}
	result, err := opaque.OpaqueServerFinishLogin(opaque.ServerFinishLoginParams{ServerLoginState: state, FinishLoginRequest: message, Identifiers: ids.Identifiers})
	if err != nil {
		return p.ChannelKeys{}, err
	}
	raw, err := client.Binary(result.SessionKey)
	if err != nil {
		return p.ChannelKeys{}, err
	}
	defer clear(raw)
	return p.PairingChannelKeys(raw)
}
