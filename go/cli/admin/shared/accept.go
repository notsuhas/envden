package shared

import (
	"context"

	"github.com/notsuhas/envden/go/cli/vault/join"
)

func AcceptHistory(ctx context.Context, c *Context, h History) error {
	_, err := join.AcceptJoin(ctx, c.Adapters, c.Client, c.Identity, c.Local.Server.Address, h.State.ServerPin, h, HeaderHash(h.Headers[len(h.Headers)-1]))

	return err
}
