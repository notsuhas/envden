package recovery

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/envelope"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func openKitEnvelope(ctx context.Context, cl *client.Client, history vault.History, o JoinOptions, id []byte) (content.Envelope, error) {
	secret, err := keys.DecodeSecretKey(o.SecretKey)
	if err != nil {
		return content.Envelope{}, err
	}

	head := history.Headers[len(history.Headers)-1]
	response, err := cl.Request(ctx, "/v1/envelope", "GET", nil)
	if err != nil {
		return content.Envelope{}, err
	}

	box, err := io.ReadAll(response.Body)
	_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
	if err != nil {
		return content.Envelope{}, err
	}

	if !encoding.Equal(crypto.H("envelope-blob", box), head.Body.EnvelopeHash) {
		return content.Envelope{}, errors.New(errors.InvalidData, "Envelope hash mismatch")
	}

	opened, err := envelope.OpenEnvelope(box, o.Password, secret, id)
	clear(secret)
	if err != nil {
		if _, ok := errors.As(err); ok {
			return content.Envelope{}, err
		}

		return content.Envelope{}, errors.Wrap(errors.InvalidData, "Invalid recovery envelope", err)
	}

	return opened, nil
}
