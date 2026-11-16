package onboarding

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity/name"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"github.com/notsuhas/envden/go/core/textcase"
)

func readToken(value string, p Prompts, stdin io.Reader) (string, error) {
	if value == "" && p.Interactive {
		return p.Secret("Server setup token", func(s string) string {
			if proofs.IsToken("setup", s) {
				return ""
			}

			return "Not a setup token"
		})
	}

	if value == "" {
		raw, err := io.ReadAll(stdin)
		if err != nil {
			return "", err
		}

		value = textcase.Trim(string(raw))
		if value == "" {
			return "", errors.New(errors.InvalidInput, "Provide the token on stdin or use the prompt in a terminal")
		}
	}

	_, err := proofs.DecodeToken("setup", value)

	return value, err
}

func askName(value, hostname string, p Prompts) (string, error) {
	if value != "" {
		return value, nil
	}

	suggested := name.Suggested(hostname)
	if p.Interactive {
		return p.Input("Device name", suggested, true, nil)
	}

	return suggested, nil
}

func checkServer(ctx context.Context, a contracts.Adapters, address, token string) error {
	server, err := client.Hello(ctx, address, nil, a.Fetcher, "")
	if err != nil {
		if errors.Is(err, errors.ServerTooOld) || errors.Is(err, errors.UpdateRequired) {
			return err
		}

		return errors.Wrap(errors.ServerUnreachable, "Can't reach "+address+". Check the address and that the server is running", err)
	}

	decoded, err := proofs.DecodeToken("setup", token)
	if err != nil {
		return err
	}

	if !encoding.Equal(server.Pin, decoded.ServerPin) {
		return errors.New(errors.InvalidInput, "This setup token is for a different server")
	}

	return nil
}
