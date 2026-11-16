package remote

import (
	"bytes"
	"io"
	"path/filepath"
	"sort"
	"strconv"

	"github.com/notsuhas/envden/go/cli/client"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/vault"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
)

type Accepted struct {
	Repairs       []manifests.FileEntry
	NoFastForward map[string]bool
}

func AcceptHead(context *syncmodel.Context, history *vault.History, readOnly bool) (Accepted, error) {
	result := Accepted{Repairs: []manifests.FileEntry{}, NoFastForward: map[string]bool{}}
	pending, err := PendingRepairs(context.Adapters.Home)
	if err != nil {
		return result, err
	}

	for _, id := range pending {
		result.NoFastForward[id] = true
	}

	response, err := context.Client.Request(context.Context, "/v1/head", "GET", nil)
	if err != nil {
		return result, err
	}

	raw, err := io.ReadAll(response.Body)
	_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
	if err != nil {
		return result, err
	}

	if history == nil {
		value, err := vault.ReadHistory(context.Context, context.Client, context.VaultID, context.State)
		if err != nil {
			return result, err
		}

		history = &value
	}

	var head *encoding.Signed[manifests.ManifestHeader]

	for _, v := range history.Headers {
		if bytes.Equal(encoding.SignedCodec(manifests.ManifestHeaderCodec).Write(v), raw) {
			head = &v
			break
		}
	}

	if head == nil {
		value, err := vault.ReadHistory(context.Context, context.Client, context.VaultID, context.State)
		if err != nil {
			return result, err
		}

		history = &value
		stored := [][]byte{}

		for _, v := range context.State.Headers {
			value, err := client.Binary(v)
			if err != nil {
				return result, err
			}

			stored = append(stored, value)
		}

		valueHead, err := client.DecodeHistoryHeader(raw, history.Entries, stored, context.State.Latest, history.States)
		if err != nil {
			return result, err
		}

		head = &valueHead
	}

	source := &manifestSource{context: context, remote: *history, head: *head, fileLists: map[string]manifests.Files{}}
	ids := map[string]bool{}

	for _, entry := range context.Checkpoint.Files.Entries {
		ids[encoding.Base32(entry.FileId)] = true
	}

	accepted, err := chain.AcceptManifest(chain.AcceptInput{Checkpoint: context.Checkpoint, Head: *head, StoredHeaders: context.Headers, Source: source, LocalFileIds: ids})
	if err != nil {
		return result, err
	}

	switch accepted.Kind {
	case "unchanged":
		return result, nil
	case "rollback":
		return result, envdenerrors.New(envdenerrors.Rollback, "Server rolled back; run envden server repair")
	case "fork":
		local, _ := crypto.ObjectHash(manifests.ManifestHeaderCodec, context.Checkpoint.Header, "manifest")
		remote, _ := crypto.ObjectHash(manifests.ManifestHeaderCodec, *head, "manifest")
		context.Report("Local head: " + client.Text(local) + "; server head: " + client.Text(remote))

		return result, envdenerrors.New(envdenerrors.Fork, "Server history forked; create a new vault from a trusted device's store")
	case "accepted":
	default:
		return result, envdenerrors.New(envdenerrors.InvalidData, "Invalid manifest history")
	}

	context.Checkpoint = *accepted.Checkpoint
	bySeq := map[uint64]encoding.Signed[manifests.ManifestHeader]{}

	for _, v := range context.Headers {
		bySeq[v.Body.Seq] = v
	}

	for _, v := range accepted.Headers {
		bySeq[v.Body.Seq] = v
	}

	context.Headers = nil

	for _, v := range bySeq {
		context.Headers = append(context.Headers, v)
	}

	sort.Slice(context.Headers, func(i, j int) bool { return context.Headers[i].Body.Seq < context.Headers[j].Body.Seq })
	context.Entries = nil

	for _, v := range history.Entries {
		if v.Body.Seq <= head.Body.ListSeq {
			context.Entries = append(context.Entries, v)
		}
	}

	if source.keyring != nil {
		ring, err := keyring.OpenKeyring(source.keyring, context.Keys[head.Body.Epoch], context.VaultID, head.Body.Epoch, context.Checkpoint.State.Commits, context.Checkpoint.IdKey)
		if err != nil {
			return result, err
		}

		for _, v := range ring.Older {
			context.Keys[v.Epoch] = v.Key
		}

		context.State.Keyring = client.Text(source.keyring)

		if !readOnly {
			if err = context.Adapters.Keychain.Set("envden/"+context.Adapters.Home+"/epoch/"+strconv.Itoa(head.Body.Epoch), context.Keys[head.Body.Epoch]); err != nil {
				return result, err
			}
		}
	}

	result.Repairs = accepted.Repairs

	if readOnly {
		return result, nil
	}

	for hash, files := range source.fileLists {
		if err = statefiles.AtomicWrite(filepath.Join(context.Adapters.Home, "state", "file-lists", hash), manifests.FilesCodec.Write(files), context.Options.Now); err != nil {
			return result, err
		}
	}

	for _, id := range accepted.NoFastForward {
		if !result.NoFastForward[id] {
			pending = append(pending, id)
		}

		result.NoFastForward[id] = true
	}

	return result, SavePendingRepairs(context.Adapters.Home, pending, context.Options.Now)
}
