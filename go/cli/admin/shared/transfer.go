package shared

import (
	"context"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/client/routes"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func OptionalObject(ctx context.Context, c *client.Client, path string) ([]byte, error) {
	data, err := routes.Bytes(ctx, c, path, "GET", nil)
	if errors.Is(err, errors.NotFound) {
		return nil, nil
	}

	return data, err
}

func Send(ctx context.Context, c *client.Client, path, method string, body any) error {
	response, err := c.Request(ctx, path, method, body)
	if err != nil {
		return err
	}

	return response.Body.Close()
}

func HistorySwaps(h History, files func([]byte) ([]byte, error), after uint64) ([]manifests.Swap, error) {
	swaps := []manifests.Swap{}
	var listSeq uint64
	first := true
	for _, header := range h.Headers {
		if header.Body.Seq <= after {
			listSeq = header.Body.ListSeq
			first = false
			continue
		}

		body, err := files(header.Body.FilesHash)
		if err != nil {
			return nil, err
		}

		if body != nil && !encoding.Equal(crypto.H("files", body), header.Body.FilesHash) {
			return nil, errors.New(errors.InvalidData, "File list hash mismatch")
		}

		swap := manifests.Swap{ExpectedHead: header.Body.Prev, Header: header, Entries: []encoding.Signed[codecs.Entry]{}}
		for _, entry := range h.Entries {
			if (first || entry.Body.Seq > listSeq) && entry.Body.Seq <= header.Body.ListSeq {
				swap.Entries = append(swap.Entries, entry)
			}
		}

		if body != nil {
			f, e := encoding.Decode(manifests.FilesCodec, body)
			if e != nil {
				return nil, e
			}

			swap.Files = &f
		}

		swaps = append(swaps, swap)
		listSeq = header.Body.ListSeq
		first = false
	}

	return swaps, nil
}

func CopyServer(ctx context.Context, source, destination *client.Client, h History) error {
	hashes, err := routes.Do(ctx, source, routes.Blobs, nil)
	if err != nil {
		return err
	}

	for _, hash := range hashes.Objects {
		raw, e := OptionalObject(ctx, source, "/v1/blobs/"+hash)
		if e != nil {
			return e
		}

		if raw == nil || client.Text(crypto.H("blob", raw)) != hash {
			return errors.New(errors.InvalidData, "Move blob hash mismatch")
		}

		if e = Send(ctx, destination, "/v1/blobs/"+hash, "PUT", raw); e != nil {
			return e
		}
	}

	swaps, err := HistorySwaps(h, func(hash []byte) ([]byte, error) { return OptionalObject(ctx, source, "/v1/files/"+client.Text(hash)) }, 0)
	if err != nil {
		return err
	}

	raw, err := encoding.Encode(encoding.List(manifests.SwapCodec), swaps)
	if err != nil {
		return err
	}

	if err = Send(ctx, destination, "/v1/move/chain", "POST", raw); err != nil {
		return err
	}

	for _, header := range h.Headers {
		hash := client.Text(header.Body.KeyringHash)
		data, e := OptionalObject(ctx, source, "/v1/keyrings/"+hash)
		if e != nil {
			return e
		}

		if data != nil {
			if e = Send(ctx, destination, "/v1/move/material/keyring/"+hash, "PUT", data); e != nil {
				return e
			}
		}
	}

	envelope, err := OptionalObject(ctx, source, "/v1/envelope")
	if err != nil {
		return err
	}

	head := h.Headers[len(h.Headers)-1].Body
	if envelope == nil || !encoding.Equal(crypto.H("envelope-blob", envelope), head.EnvelopeHash) {
		return errors.New(errors.InvalidData, "Move envelope hash mismatch")
	}

	if err = Send(ctx, destination, "/v1/move/material/envelope/"+client.Text(head.EnvelopeHash), "PUT", envelope); err != nil {
		return err
	}

	pub, err := OptionalObject(ctx, source, "/v1/move/sk-pub")
	if err != nil {
		return err
	}

	if pub == nil {
		return errors.New(errors.InvalidData, "Missing secret key public key")
	}

	if err = Send(ctx, destination, "/v1/move/material/skPub/"+client.Text(crypto.H("sk-public", pub)), "PUT", pub); err != nil {
		return err
	}

	period, err := routes.Do(ctx, source, routes.Route[serverprotocol.UnlockPeriod]{Path: "/v1/move/period", Method: "GET", Schema: serverprotocol.UnlockPeriodSchema}, nil)
	if err != nil {
		return err
	}

	return Send(ctx, destination, "/v1/move/period", "PUT", period)
}
