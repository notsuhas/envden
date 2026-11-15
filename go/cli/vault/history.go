package vault

import (
	"context"
	"encoding/binary"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"io"
	"strconv"
)

type History struct {
	Entries []b.Signed[p.Entry]
	Headers []b.Signed[m.ManifestHeader]
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
		response.Body.Close()
		if err != nil {
			return nil, err
		}
		page, err := s.ObjectsResponseSchema.Decode(raw)
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
	result := History{Entries: []b.Signed[p.Entry]{}, Headers: []b.Signed[m.ManifestHeader]{}, States: map[uint64]*devices.State{}}
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
		entry, err := b.Decode(p.SignedCodec(p.EntryCodec), raw)
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
		h, err := b.Decode(p.SignedCodec(m.ManifestHeaderCodec), raw)
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
	if !b.Equal(result.State.VaultId, vaultID) || len(result.Headers) == 0 {
		return result, errors.New(errors.InvalidData, "Invalid vault history")
	}
	if err = verifyHeaders(result, first, vaultID); err != nil {
		return result, err
	}
	final := result.Headers[len(result.Headers)-1].Body
	if final.ListSeq != result.State.Seq || !b.Equal(final.ListHead, result.State.Head) {
		return result, errors.New(errors.InvalidData, "Uncommitted device list entries")
	}
	return result, nil
}

func HistoryHasHeader(h History, hash []byte) bool {
	for _, header := range h.Headers {
		v, err := c.ObjectHash(m.ManifestHeaderCodec, header, "manifest")
		if err == nil && b.Equal(v, hash) {
			return true
		}
	}
	return false
}
