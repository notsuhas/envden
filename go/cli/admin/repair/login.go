package repair

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/client/routes"
	"github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
)

func RepairLogin(ctx context.Context, c *client.Client, vaultID []byte, password, kind string) (s.RepairFinish, error) {
	ids, err := opaque.UnlockIdentifiers(vaultID)
	if err != nil {
		return s.RepairFinish{}, err
	}
	route := routes.Route[s.MailboxWrite]{Path: "/v1/opaque/registration/start", Method: "POST", Schema: s.MessageResponseSchema}
	if kind == "register" {
		start, e := opaque.OpaqueStartRegistration(password)
		if e != nil {
			return s.RepairFinish{}, e
		}
		body, e := routes.Do(ctx, c, route, struct {
			Message string `json:"message"`
		}{start.RegistrationRequest})
		if e != nil {
			return s.RepairFinish{}, e
		}
		finish, e := opaque.OpaqueFinishRegistration(opaque.FinishRegistrationParams{Password: password, RegistrationResponse: body.Message, ClientRegistrationState: start.ClientRegistrationState, Identifiers: ids.Identifiers})
		if e != nil {
			return s.RepairFinish{}, e
		}
		return s.RepairFinish{Kind: "registration", Message: finish.RegistrationRecord}, nil
	}
	start, err := opaque.OpaqueStartLogin(password)
	if err != nil {
		return s.RepairFinish{}, err
	}
	route.Path = "/v1/opaque/login/start"
	body, err := routes.Do(ctx, c, route, struct {
		Purpose string `json:"purpose"`
		Message string `json:"message"`
	}{"unlock", start.StartLoginRequest})
	if err != nil {
		return s.RepairFinish{}, err
	}
	finish, err := opaque.OpaqueFinishLogin(opaque.FinishLoginParams{Password: password, LoginResponse: body.Message, ClientLoginState: start.ClientLoginState, Identifiers: ids.Identifiers})
	if err != nil {
		return s.RepairFinish{}, err
	}
	if !finish.OK {
		return s.RepairFinish{}, errors.New(errors.Unauthorized, "Password login failed")
	}
	return s.RepairFinish{Kind: "login", Purpose: "unlock", Message: finish.FinishLoginRequest}, nil
}
