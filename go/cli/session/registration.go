package session

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	"io"
)

func RegisterPassword(ctx context.Context, c *client.Client, vaultID []byte, password string) (string, error) {
	start, err := opaque.OpaqueStartRegistration(password)
	if err != nil {
		return "", err
	}
	response, err := c.Request(ctx, "/v1/opaque/registration/start", "POST", struct {
		Message string `json:"message"`
	}{start.RegistrationRequest})
	if err != nil {
		return "", err
	}
	raw, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		return "", err
	}
	body, err := p.MessageResponseSchema.Decode(raw)
	if err != nil {
		return "", err
	}
	ids, err := opaque.UnlockIdentifiers(vaultID)
	if err != nil {
		return "", err
	}
	finish, err := opaque.OpaqueFinishRegistration(opaque.FinishRegistrationParams{Password: password, RegistrationResponse: body.Message, ClientRegistrationState: start.ClientRegistrationState, Identifiers: ids.Identifiers})
	if err != nil {
		return "", err
	}
	response, err = c.Request(ctx, "/v1/opaque/registration/finish", "POST", struct {
		Message string `json:"message"`
	}{finish.RegistrationRecord})
	if err != nil {
		return "", err
	}
	response.Body.Close()
	return finish.RegistrationRecord, nil
}
