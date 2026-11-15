package vault

import (
	"context"
	"encoding/binary"
	"io"
	"strconv"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type History struct {
	Entries []encoding.Signed[codecs.Entry]
	Headers []encoding.Signed[manifests.ManifestHeader]
	State   *devices.State
	States  map[uint64]*devices.State
}

func historyObjects(ctx context.Context, cl *client.Client, path string, from uint64) ([][]byte, error) {
	result := [][]byte{}
	for {
		response, err := cl.Request(ctx, path+"?from="+strconv.FormatUint(from, 10), "GET", nil)
		if err != nil {
			return nil, err
		}

		raw, err := io.ReadAll(response.Body)
		_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
		if err != nil {
			return nil, err
		}

		page, err := serverprotocol.ObjectsResponseSchema.Decode(raw)
		if err != nil {
			return nil, err
		}

		if len(page.Objects) == 0 {
			return result, nil
		}

		for _, encoded := range page.Objects {
			raw, err := client.Binary(encoded)
			if err != nil {
				return nil, err
			}

			result = append(result, raw)
		}

		last := result[len(result)-1]
		if len(last) < 42 {
			return nil, errors.New(errors.InvalidData, "Truncated data")
		}

		seq := binary.BigEndian.Uint64(last[34:42])
		if seq < from {
			return nil, errors.New(errors.InvalidData, "Invalid history page")
		}

		from = seq + 1
	}
}

func ReadHistory(ctx context.Context, cl *client.Client, vaultID []byte, local *model.State) (History, error) {
	result := History{Entries: []encoding.Signed[codecs.Entry]{}, Headers: []encoding.Signed[manifests.ManifestHeader]{}, States: map[uint64]*devices.State{}}
	var storedEntries, storedHeaders [][]byte
	latest := ""
	if local != nil {
		latest = local.Latest
		for _, v := range local.Entries {
			raw, err := client.Binary(v)
			if err != nil {
				return result, err
			}

			storedEntries = append(storedEntries, raw)
		}

		for _, v := range local.Headers {
			raw, err := client.Binary(v)
			if err != nil {
				return result, err
			}

			storedHeaders = append(storedHeaders, raw)
		}
	}

	for _, raw := range storedEntries {
		entry, err := encoding.Decode(codecs.SignedCodec(codecs.EntryCodec), raw)
		if err != nil {
			return result, err
		}

		applied, err := devices.ApplyEntry(result.State, entry)
		if err != nil {
			return result, err
		}

		if applied.Kind != "valid" {
			return result, errors.New(errors.InvalidData, "Invalid stored device list")
		}

		result.State = applied.State
		result.States[result.State.Seq] = result.State
		result.Entries = append(result.Entries, entry)
	}

	from := uint64(0)
	if result.State != nil {
		from = result.State.Seq + 1
	}

	incoming, err := historyObjects(ctx, cl, "/v1/entries", from)
	if err != nil {
		return result, err
	}

	decoded, err := client.DecodeHistoryEntries(incoming, storedEntries, latest, result.State)
	if err != nil {
		return result, err
	}

	result.Entries = append(result.Entries, decoded.Entries...)
	result.State = decoded.State
	for seq, at := range decoded.States {
		result.States[seq] = at
	}

	for _, raw := range storedHeaders {
		h, err := encoding.Decode(codecs.SignedCodec(manifests.ManifestHeaderCodec), raw)
		if err != nil {
			return result, err
		}

		result.Headers = append(result.Headers, h)
	}

	first := len(result.Headers)
	incoming, err = historyObjects(ctx, cl, "/v1/headers", uint64(first+1))
	if err != nil {
		return result, err
	}

	for _, raw := range incoming {
		h, err := client.DecodeHistoryHeader(raw, result.Entries, storedHeaders, latest, result.States)
		if err != nil {
			return result, err
		}

		result.Headers = append(result.Headers, h)
	}

	if !encoding.Equal(result.State.VaultId, vaultID) || len(result.Headers) == 0 {
		return result, errors.New(errors.InvalidData, "Invalid vault history")
	}

	if err = verifyHeaders(result, first, vaultID); err != nil {
		return result, err
	}

	final := result.Headers[len(result.Headers)-1].Body
	if final.ListSeq != result.State.Seq || !encoding.Equal(final.ListHead, result.State.Head) {
		return result, errors.New(errors.InvalidData, "Uncommitted device list entries")
	}

	return result, nil
}

func HistoryHasHeader(h History, hash []byte) bool {
	for _, header := range h.Headers {
		v, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, header, "manifest")
		if err == nil && encoding.Equal(v, hash) {
			return true
		}
	}

	return false
}
