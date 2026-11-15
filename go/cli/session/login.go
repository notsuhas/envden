package session

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	"io"
)

type Password struct {
	Value  string
	Prompt func(retry bool) (string, error)
}

func Login(ctx context.Context, c *client.Client, vaultID []byte, password Password, purpose string) (*model.Window, error) {
	if purpose == "" {
		purpose = "unlock"
	}
	for attempt := 1; ; attempt++ {
		value := password.Value
		if password.Prompt != nil {
			var err error
			value, err = password.Prompt(attempt > 1)
			if err != nil {
				return nil, err
			}
		}
		window, done, err := attemptLogin(ctx, c, vaultID, value, purpose)
		if err != nil {
			return nil, err
		}
		if done {
			return window, nil
		}
		if password.Prompt == nil || attempt == 3 {
			return nil, errors.New(errors.Unauthorized, "Wrong master password")
		}
	}
}

func attemptLogin(ctx context.Context, c *client.Client, vaultID []byte, password, purpose string) (*model.Window, bool, error) {
	start, err := opaque.OpaqueStartLogin(password)
	if err != nil {
		return nil, false, err
	}
	response, err := c.Request(ctx, "/v1/opaque/login/start", "POST", struct {
		Purpose string `json:"purpose"`
		Message string `json:"message"`
	}{purpose, start.StartLoginRequest})
	if err != nil {
		return nil, false, err
	}
	raw, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		return nil, false, err
	}
	body, err := p.MessageResponseSchema.Decode(raw)
	if err != nil {
		return nil, false, err
	}
	ids, err := opaque.UnlockIdentifiers(vaultID)
	if err != nil {
		return nil, false, err
	}
	finish, err := opaque.OpaqueFinishLogin(opaque.FinishLoginParams{Password: password, ClientLoginState: start.ClientLoginState, LoginResponse: body.Message, Identifiers: ids.Identifiers})
	if err != nil {
		return nil, false, err
	}
	if !finish.OK {
		return nil, false, nil
	}
	response, err = c.Request(ctx, "/v1/opaque/login/finish", "POST", struct {
		Purpose string `json:"purpose"`
		Message string `json:"message"`
	}{purpose, finish.FinishLoginRequest})
	if err != nil {
		return nil, false, err
	}
	raw, err = io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		return nil, false, err
	}
	parsed, err := p.LoginFinishResponseSchema.Decode(raw)
	expected := "unlocked"
	if purpose == "kit" {
		expected = "ticket"
	}
	if err != nil || parsed.Kind != expected {
		return nil, false, errors.New(errors.InvalidData, "Invalid login result")
	}
	if parsed.Kind == "ticket" {
		return nil, true, nil
	}
	return &model.Window{UnlockedUntil: parsed.UnlockedUntil, FreshUntil: *parsed.FreshUntil}, true, nil
}
