package repair

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/errors"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
)

type Context struct {
	*shared.Context
	RepairID []byte
}

func RepairContext(ctx context.Context, a contracts.Adapters, text string, now func() int64, fetch client.Fetch) (*Context, error) {
	token, err := proofs.DecodeToken("repair", text)
	if err != nil {
		return nil, err
	}

	key, err := proofs.TokenKey("repair", token.Secret)
	if err != nil {
		return nil, err
	}

	c, err := shared.AdminContext(ctx, a, now, fetch, func(request serverprotocol.Request) ([]byte, error) { return proofs.TokenProof("repair", key, request) })
	if err != nil {
		return nil, err
	}

	pin, err := client.Binary(c.Local.Server.Pin)
	if err != nil {
		return nil, err
	}

	if !encoding.Equal(pin, token.ServerPin) {
		return nil, errors.New(errors.InvalidInput, "Repair token is for another server")
	}

	_, chain, err := LocalRepairChain(c.Local.Entries)
	if err != nil {
		return nil, err
	}

	id := crypto.H("repair-id", token.Secret)
	if chain.Kind != "valid" || repair.IsReusedRepairToken(id, chain.State.RepairIds) {
		return nil, errors.New(errors.InvalidData, "Repair token was already used")
	}

	return &Context{c, id}, nil
}
