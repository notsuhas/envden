package pairing

import (
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"io"
)

func PutSlot(ctx context.Context, cl *client.Client, mailbox int, slot, message string) (int64, error) {
	response, err := cl.Request(ctx, fmt.Sprintf("/v1/pairing/mailboxes/%d/%s", mailbox, slot), "PUT", struct {
		Message string `json:"message"`
	}{message})
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return 0, err
	}
	value, err := s.MailboxWriteResponseSchema.Decode(raw)
	return value.ExpiresAt, err
}

func GetSlot(ctx context.Context, cl *client.Client, mailbox int, slot string) (string, error) {
	response, err := cl.Request(ctx, fmt.Sprintf("/v1/pairing/mailboxes/%d/%s", mailbox, slot), "GET", nil)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return "", err
	}
	value, err := s.MailboxSlotResponseSchema.Decode(raw)
	if err != nil {
		return "", err
	}
	if value.Message == nil {
		return "", errors.New(errors.NotFound, "Pairing message pending")
	}
	return *value.Message, nil
}
