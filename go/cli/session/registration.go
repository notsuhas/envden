package session

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
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
	_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
	if err != nil {
		return "", err
	}

	body, err := serverprotocol.MessageResponseSchema.Decode(raw)
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

	_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.

	return finish.RegistrationRecord, nil
}
