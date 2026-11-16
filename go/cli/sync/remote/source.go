package remote

import (
	"bytes"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/join/material"
	"github.com/notsuhas/envden/go/cli/vault/keys"
	"github.com/notsuhas/envden/go/core/chain/devices"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
)

type manifestSource struct {
	context   *syncmodel.Context
	remote    vault.History
	head      encoding.Signed[manifests.ManifestHeader]
	fileLists map[string]manifests.Files
	keyring   []byte
}

func (s *manifestSource) Header(hash []byte) (*encoding.Signed[manifests.ManifestHeader], error) {
	for _, v := range s.remote.Headers {
		h, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, v, "manifest")
		if err != nil {
			return nil, err
		}

		if bytes.Equal(hash, h) {
			return &v, nil
		}
	}

	return nil, nil
}

func (s *manifestSource) Entry(hash []byte) (*encoding.Signed[codecs.Entry], error) {
	for _, v := range s.remote.Entries {
		h, err := crypto.ObjectHash(codecs.EntryCodec, v, "entry")
		if err != nil {
			return nil, err
		}

		if bytes.Equal(hash, h) {
			return &v, nil
		}
	}

	return nil, nil
}

func (s *manifestSource) Files(hash []byte) (*manifests.Files, error) {
	raw, err := material.VerifiedBlob(s.context.Context, s.context.Client, "files", "files", hash)

	if envdenerrors.Is(err, envdenerrors.NotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	files, err := encoding.Decode(manifests.FilesCodec, raw)
	if err != nil {
		return nil, err
	}

	s.fileLists[client.Text(hash)] = files

	return &files, nil
}

func (s *manifestSource) Keyring(hash []byte) ([]byte, error) {
	response, err := s.context.Client.Request(s.context.Context, "/v1/keyrings/"+client.Text(hash), "GET", nil)
	if err != nil {
		return nil, err
	}

	defer func() { _ = response.Body.Close() }() // Best-effort cleanup preserves the original operation result.
	s.keyring, err = io.ReadAll(response.Body)

	return s.keyring, err
}

func (s *manifestSource) EpochKey(epoch int) ([]byte, error) {
	entries := []encoding.Signed[codecs.Entry]{}

	for _, v := range s.remote.Entries {
		if v.Body.Seq <= s.head.Body.ListSeq {
			entries = append(entries, v)
		}
	}

	chain, err := devices.VerifyChain(entries)
	if err != nil {
		return nil, err
	}

	if chain.Kind != "valid" {
		return nil, nil
	}

	wrap := keys.DeviceWrap(s.remote.Entries, s.context.Identity.Record.Id, &s.head.Body.ListSeq)
	commit := chain.State.Commits[epoch]

	if wrap == nil || commit == nil {
		return nil, nil
	}

	key, err := epochs.OpenWrap(*wrap, s.context.Identity.Keys.EncSk, s.context.Identity.Record.EncPub, s.context.VaultID, epoch, commit)
	if err == nil {
		s.context.Keys[epoch] = key
	}

	return key, err
}
