package pairing

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

type Response struct {
	ExpiresAt int64
	Message   *string
}

func PairingResponse(raw []byte, expiresAt int64) (Response, error) {
	slot, err := serverprotocol.MailboxSlotResponseSchema.Decode(raw)
	if err == nil {
		return Response{min(expiresAt, slot.ExpiresAt), slot.Message}, nil
	}

	message, err := serverprotocol.MessageResponseSchema.Decode(raw)
	if err == nil {
		return Response{expiresAt, &message.Message}, nil
	}

	if _, err = serverprotocol.PendingResponseSchema.Decode(raw); err != nil {
		return Response{}, errors.New(errors.InvalidData, "Invalid pairing response")
	}

	return Response{ExpiresAt: expiresAt}, nil
}

func WaitMessage(ctx context.Context, cl *client.Client, path string, now func() int64, expiresAt int64, pause func(context.Context) error) (string, error) {
	duration := int64(600000)
	if path == "/v1/pairing/approver" {
		duration = 86400000
	}

	deadline := min(expiresAt, now()+duration)
	expiresAt = deadline
	for now() < expiresAt {
		response, err := cl.Request(ctx, path, "GET", nil)
		if err == nil {
			raw, readErr := io.ReadAll(response.Body)
			_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
			if readErr != nil {
				return "", readErr
			}

			result, parseErr := PairingResponse(raw, expiresAt)
			if parseErr != nil {
				return "", parseErr
			}

			expiresAt = min(expiresAt, result.ExpiresAt, deadline)
			if result.Message != nil {
				return *result.Message, nil
			}
		} else if !errors.Is(err, errors.NotFound) || path != "/v1/pairing/approver" {
			return "", err
		}

		if err = pause(ctx); err != nil {
			return "", err
		}
	}

	return "", errors.New(errors.Busy, "Pairing timed out; run envden join --resume after approval, or create a new pairing code")
}

func RequireWindow(expiresAt, now int64) error {
	if expiresAt > now+600000 {
		return errors.New(errors.InvalidData, "Pairing window exceeds ten minutes")
	}

	if now >= expiresAt {
		return errors.New(errors.Unauthorized, "Pairing exchange expired")
	}

	return nil
}

func ApprovalDeadline(expiry int64) int64 { return expiry + 86400000 }
