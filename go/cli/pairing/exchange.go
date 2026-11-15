package pairing

import (
	"context"
	"fmt"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
)

func PutSlot(ctx context.Context, cl *client.Client, mailbox int, slot, message string) (int64, error) {
	response, err := cl.Request(ctx, fmt.Sprintf("/v1/pairing/mailboxes/%d/%s", mailbox, slot), "PUT", struct {
		Message string `json:"message"`
	}{message})
	if err != nil {
		return 0, err
	}

	defer func() { _ = response.Body.Close() }() // Best-effort cleanup must not replace the operation result.
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return 0, err
	}

	value, err := serverprotocol.MailboxWriteResponseSchema.Decode(raw)

	return value.ExpiresAt, err
}

func GetSlot(ctx context.Context, cl *client.Client, mailbox int, slot string) (string, error) {
	response, err := cl.Request(ctx, fmt.Sprintf("/v1/pairing/mailboxes/%d/%s", mailbox, slot), "GET", nil)
	if err != nil {
		return "", err
	}

	defer func() { _ = response.Body.Close() }() // Best-effort cleanup must not replace the operation result.
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return "", err
	}

	value, err := serverprotocol.MailboxSlotResponseSchema.Decode(raw)
	if err != nil {
		return "", err
	}

	if value.Message == nil {
		return "", errors.New(errors.NotFound, "Pairing message pending")
	}

	return *value.Message, nil
}
