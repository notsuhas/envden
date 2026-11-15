package remote

import (
	"bytes"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/cli/vault/join/material"
	"github.com/notsuhas/envden/go/cli/vault/keys"
	"github.com/notsuhas/envden/go/core/chain/devices"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
)

type manifestSource struct {
	context   *sm.Context
	remote    vault.History
	head      b.Signed[m.ManifestHeader]
	fileLists map[string]m.Files
	keyring   []byte
}

func (s *manifestSource) Header(hash []byte) (*b.Signed[m.ManifestHeader], error) {
	for _, v := range s.remote.Headers {
		h, err := cr.ObjectHash(m.ManifestHeaderCodec, v, "manifest")
		if err != nil {
			return nil, err
		}
		if bytes.Equal(hash, h) {
			return &v, nil
		}
	}

	return nil, nil
}

func (s *manifestSource) Entry(hash []byte) (*b.Signed[c.Entry], error) {
	for _, v := range s.remote.Entries {
		h, err := cr.ObjectHash(c.EntryCodec, v, "entry")
		if err != nil {
			return nil, err
		}
		if bytes.Equal(hash, h) {
			return &v, nil
		}
	}

	return nil, nil
}

func (s *manifestSource) Files(hash []byte) (*m.Files, error) {
	raw, err := material.VerifiedBlob(s.context.Context, s.context.Client, "files", "files", hash)
	if e.Is(err, e.NotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	files, err := b.Decode(m.FilesCodec, raw)
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
	defer response.Body.Close()
	s.keyring, err = io.ReadAll(response.Body)

	return s.keyring, err
}

func (s *manifestSource) EpochKey(epoch int) ([]byte, error) {
	entries := []b.Signed[c.Entry]{}
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
