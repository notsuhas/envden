package repair

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vault"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func StoreMaterial(o shared.Options, auth *shared.Auth, kind string, hash, data []byte) (wire.KindResponse, error) {
	return shared.Transaction(o.Storage, func() (wire.KindResponse, error) {
		id := auth.Request.VaultId
		metadata, err := o.Storage.Vault(id)
		if err != nil {
			return wire.KindResponse{}, err
		}
		if metadata.Restored != nil {
			membership, err := vaultchain.Membership(o, id, auth.Request.Device)
			if err != nil {
				return wire.KindResponse{}, err
			}
			if membership == nil {
				return wire.KindResponse{}, enverrors.New(enverrors.NotMember, "Membership required")
			}
			if kind == "skPub" {
				return wire.KindResponse{}, enverrors.New(enverrors.InvalidInput, "Invalid repair material")
			}
		}
		if kind == "files" {
			return restoreFiles(o, id, hash, data)
		}
		if len(data) > 16777216 || kind != "keyring" && kind != "envelope" && kind != "skPub" {
			return wire.KindResponse{}, enverrors.New(enverrors.InvalidInput, "Invalid material")
		}
		domain := "keyring-blob"
		if kind == "envelope" {
			domain = "envelope-blob"
		}
		if kind == "skPub" && len(data) != 32 || kind != "skPub" && !bytes.Equal(crypto.H(domain, data), hash) {
			return wire.KindResponse{}, enverrors.New(enverrors.InvalidData, "Material hash mismatch")
		}
		requiresStagedRecord := kind != "skPub"
		if requiresStagedRecord {
			referencedResult, err := referenced(o, id, kind, hash)
			if err != nil {
				return wire.KindResponse{}, err
			}
			requiresStagedRecord = !referencedResult
		}
		if requiresStagedRecord {
			return wire.KindResponse{}, enverrors.New(enverrors.InvalidData, "Unreferenced material")
		}
		key := []byte{}
		stateKind := adapters.StateSKPub
		switch kind {
		case "keyring":
			key = hash
			stateKind = adapters.StateKeyring
		case "envelope":
			stateKind = adapters.StateEnvelope
		}
		if err := o.Storage.WriteState(id, []adapters.StateWrite{{Kind: stateKind, Key: key, Bytes: data}}); err != nil {
			return wire.KindResponse{}, err
		}

		return wire.KindResponse{Kind: "uploaded"}, nil
	})
}

func referenced(o shared.Options, id []byte, kind string, hash []byte) (bool, error) {
	if kind == "envelope" {
		head, err := o.Storage.Head(id)
		if err != nil {
			return false, err
		}
		if head == nil {
			return false, nil
		}
		row, err := o.Storage.Header(id, head)
		if err != nil {
			return false, err
		}

		alreadyPresent := row != nil
		if alreadyPresent {
			headerResult, err := header(row.Bytes)
			if err != nil {
				return false, err
			}
			alreadyPresent = bytes.Equal(headerResult.EnvelopeHash, hash)
		}

		return alreadyPresent, nil
	}
	headers, err := o.Storage.Headers(id, 1, ^uint64(0), 0, 0)
	if err != nil {
		return false, err
	}

	for _, row := range headers {
		headerResult2, err := header(row.Bytes)
		if err != nil {
			return false, err
		}
		if bytes.Equal(headerResult2.KeyringHash, hash) {
			return true, nil
		}
	}

	return false, nil
}

func header(data []byte) (manifests.ManifestHeader, error) {
	decoded, err := encoding.Decode(encoding.SignedCodec(manifests.ManifestHeaderCodec), data)
	if err != nil {
		return manifests.ManifestHeader{}, err
	}

	return decoded.Body, nil
}

func restoreFiles(o shared.Options, id, hash, data []byte) (wire.KindResponse, error) {
	files, err := shared.Input(func() (manifests.Files, error) {
		return encoding.Decode(manifests.FilesCodec, data)
	})
	if err != nil {
		return wire.KindResponse{}, err
	}
	if !bytes.Equal(crypto.H("files", data), hash) {
		return wire.KindResponse{}, enverrors.New(enverrors.InvalidData, "Files hash mismatch")
	}
	rows, err := o.Storage.HeadersForFiles(id, hash)
	if err != nil {
		return wire.KindResponse{}, err
	}

	headers := []manifests.ManifestHeader{}
	found := false
	permanent := false
	for _, row := range rows {
		h, err := header(row.Bytes)
		if err != nil {
			return wire.KindResponse{}, err
		}

		headers = append(headers, h)
		if bytes.Equal(h.FilesHash, hash) {
			found = true
		}
	}
	if !found {
		return wire.KindResponse{}, enverrors.New(enverrors.InvalidData, "Unreferenced files")
	}
	for i, h := range headers {
		if h.Op == 11 && (bytes.Equal(h.FilesHash, hash) || i > 0 && bytes.Equal(headers[i-1].FilesHash, hash)) {
			permanent = true
		}
	}
	if err := o.Storage.PutFileList(id, adapters.StoredFiles{StoredObject: adapters.StoredObject{Hash: hash, Bytes: data}, RetainForever: permanent, Versions: vault.Versions(files.Entries)}, o.Now()); err != nil {
		return wire.KindResponse{}, err
	}

	return wire.KindResponse{Kind: "uploaded"}, nil
}
