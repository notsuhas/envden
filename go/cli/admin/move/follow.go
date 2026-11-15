package move

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type FollowResult struct {
	Kind   string
	Client *client.Client
}

func FollowServerMove(ctx context.Context, cxt *shared.Context, h shared.History, fetch client.Fetch, unlock func(context.Context, *client.Client, []byte) error) (FollowResult, error) {
	unchanged := FollowResult{Kind: "unchanged"}
	if err := shared.CheckFloor(cxt.Local, h); err != nil {
		return unchanged, err
	}

	var entry *encoding.Signed[codecs.Entry]
	for i := len(h.Entries) - 1; i >= 0; i-- {
		if h.Entries[i].Body.Kind == 5 {
			entry = &h.Entries[i]
			break
		}
	}

	if entry == nil {
		return unchanged, nil
	}

	target := entry.Body.Payload.(entrypayloads.ServerMoved)
	if cxt.Local.Server != nil && cxt.Local.Server.Pin == client.Text(target.NewPin) {
		return unchanged, nil
	}

	var header *encoding.Signed[manifests.ManifestHeader]
	for i := range h.Headers {
		if encoding.Equal(h.Headers[i].Body.ListHead, shared.EntryHash(*entry)) {
			header = &h.Headers[i]
			break
		}
	}

	if header == nil || header.Body.Op != 10 {
		return unchanged, errors.New(errors.InvalidData, "Move header missing")
	}

	if _, err := client.Hello(ctx, target.NewAddress, target.NewPin, fetch, version.MinServer); err != nil {
		return unchanged, err
	}

	cl := client.CreateClient(client.Options{Address: target.NewAddress, Pin: target.NewPin, VaultID: cxt.VaultID, Identity: cxt.Identity, Version: version.Version, Now: cxt.Now, Fetcher: fetch, HelloCache: cxt.Adapters.HelloCache})
	swap := manifests.Swap{ExpectedHead: header.Body.Prev, Header: *header, Entries: []encoding.Signed[codecs.Entry]{*entry}}
	raw, err := encoding.Encode(manifests.SwapCodec, swap)
	if err != nil {
		return unchanged, err
	}

	if err = shared.Send(ctx, cl, "/v1/swap", "POST", raw); err != nil {
		return unchanged, err
	}

	if unlock != nil {
		if err = unlock(ctx, cl, cxt.VaultID); err != nil {
			return unchanged, err
		}
	}

	destination, err := shared.ReadHistory(ctx, cl, cxt.VaultID)
	if err != nil {
		return unchanged, err
	}

	local := *cxt.Local
	local.Headers = []string{}
	for _, h := range h.Headers {
		raw, e := encoding.Encode(encoding.SignedCodec(manifests.ManifestHeaderCodec), h)
		if e != nil {
			return unchanged, e
		}

		local.Headers = append(local.Headers, client.Text(raw))
	}

	if err = shared.CheckFloor(&local, destination); err != nil {
		return unchanged, err
	}

	if !encoding.Equal(destination.State.ServerPin, target.NewPin) {
		return unchanged, errors.New(errors.InvalidData, "Destination pin does not match the move")
	}

	cxt.Local.Server = &model.Server{Address: target.NewAddress, Pin: client.Text(target.NewPin), Protocol: 1}
	if err = store.SaveState(ctx, cxt.Adapters.Home, cxt.Local, cxt.Adapters.Timing); err != nil {
		return unchanged, err
	}

	return FollowResult{Kind: "moved", Client: cl}, nil
}
