package material

import (
	"strconv"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/chain/devices"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
)

type Material struct {
	Headers    []encoding.Signed[manifests.ManifestHeader]
	Entries    []encoding.Signed[codecs.Entry]
	Keys       map[int][]byte
	Checkpoint chain.Checkpoint
}

func CheckpointMaterial(a contracts.Adapters, state *model.State) (Material, error) {
	result := Material{Headers: []encoding.Signed[manifests.ManifestHeader]{}, Entries: []encoding.Signed[codecs.Entry]{}, Keys: map[int][]byte{}}
	if state.Checkpoint == "" || state.Files == "" || state.Keyring == "" || state.VaultID == "" {
		return result, errors.New(errors.InvalidData, "Missing checkpoint material")
	}

	id, err := encoding.Unbase32(state.VaultID)
	if err != nil {
		return result, err
	}

	var header *encoding.Signed[manifests.ManifestHeader]
	for _, encoded := range state.Headers {
		raw, err := client.Binary(encoded)
		if err != nil {
			return result, err
		}

		value, err := encoding.Decode(codecs.SignedCodec(manifests.ManifestHeaderCodec), raw)
		if err != nil {
			return result, err
		}

		result.Headers = append(result.Headers, value)
		hash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, value, "manifest")
		if err != nil {
			return result, err
		}

		if client.Text(hash) == state.Checkpoint {
			header = &value
		}
	}

	for _, encoded := range state.Entries {
		raw, err := client.Binary(encoded)
		if err != nil {
			return result, err
		}

		value, err := encoding.Decode(codecs.SignedCodec(codecs.EntryCodec), raw)
		if err != nil {
			return result, err
		}

		result.Entries = append(result.Entries, value)
	}

	if header == nil {
		return result, errors.New(errors.InvalidData, "Missing checkpoint header")
	}

	entries := []encoding.Signed[codecs.Entry]{}
	for _, entry := range result.Entries {
		if entry.Body.Seq <= header.Body.ListSeq {
			entries = append(entries, entry)
		}
	}

	chainState, err := devices.VerifyChain(entries)
	if err != nil {
		return result, err
	}

	idKey, err := a.Keychain.Get("envden/"+a.Home+"/id-key", false)
	if err != nil {
		return result, err
	}

	key, err := a.Keychain.Get("envden/"+a.Home+"/epoch/"+strconv.Itoa(header.Body.Epoch), false)
	if err != nil {
		return result, err
	}

	if chainState.Kind != "valid" || idKey == nil || key == nil {
		return result, errors.New(errors.Locked, "Vault keys unavailable")
	}

	raw, err := client.Binary(state.Keyring)
	if err != nil {
		return result, err
	}

	ring, err := keyring.OpenKeyring(raw, key, id, header.Body.Epoch, chainState.State.Commits, idKey)
	if err != nil {
		return result, err
	}

	for _, item := range ring.Older {
		result.Keys[item.Epoch] = item.Key
	}

	result.Keys[header.Body.Epoch] = key
	raw, err = client.Binary(state.Files)
	if err != nil {
		return result, err
	}

	files, err := encoding.Decode(manifests.FilesCodec, raw)
	if err != nil {
		return result, err
	}

	result.Checkpoint = chain.Checkpoint{Header: *header, Files: files, State: chainState.State, IdKey: idKey}

	return result, nil
}
