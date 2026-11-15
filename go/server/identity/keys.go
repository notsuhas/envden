package identity

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"

	"github.com/google/uuid"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	opaque "github.com/notsuhas/envden/go/core/protocol/opaque"
	"github.com/notsuhas/envden/go/server/shared"
)

type persisted struct {
	SecretKey   string `json:"secretKey"`
	PublicKey   string `json:"publicKey"`
	OpaqueSetup string `json:"opaqueSetup"`
}

func LoadServerKeys(dir string) (out shared.Keys, err error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return shared.Keys{}, err
	}
	if err := process.RestrictAccessSync(dir, true); err != nil {
		return shared.Keys{}, err
	}

	path := filepath.Join(dir, "identity.json")
	raw, err := os.ReadFile(path)
	if err == nil {
		var data persisted
		if err := json.Unmarshal(raw, &data); err != nil {
			return shared.Keys{}, err
		}
		if err := process.RestrictAccessSync(path, false); err != nil {
			return shared.Keys{}, err
		}
		if data.SecretKey == "" || data.PublicKey == "" || data.OpaqueSetup == "" {
			return shared.Keys{}, enverrors.New(enverrors.InvalidData, "Invalid server identity")
		}
		binary, err := shared.Binary(data.SecretKey, 32)
		if err != nil {
			return shared.Keys{}, err
		}
		binaryResult, err := shared.Binary(data.PublicKey, 32)
		if err != nil {
			return shared.Keys{}, err
		}

		sk, pub := binary, binaryResult
		derived, err := keys.GenerateRecoveryKeys(func(int) []byte { return sk })
		if err != nil {
			return shared.Keys{}, err
		}
		if !bytes.Equal(pub, derived.ObjPub) {
			return shared.Keys{}, enverrors.New(enverrors.InvalidData, "Invalid server identity")
		}
		opaqueMessage, err := opaque.OpaqueMessage(data.OpaqueSetup, 128)
		if err != nil {
			return shared.Keys{}, err
		}

		return shared.Keys{SecretKey: sk, PublicKey: pub, OpaqueSetup: opaqueMessage}, nil
	}
	if !os.IsNotExist(err) {
		return out, err
	}
	keys, err := keys.GenerateRecoveryKeys()
	if err != nil {
		return shared.Keys{}, err
	}

	setup, err := opaque.OpaqueCreateSetup()
	if err != nil {
		return shared.Keys{}, err
	}

	encoded, err := shared.JSON(persisted{shared.Text(keys.ObjSk), shared.Text(keys.ObjPub), setup})
	if err != nil {
		return shared.Keys{}, err
	}
	if err := PersistIdentity(dir, encoded); err != nil {
		return shared.Keys{}, err
	}
	if err := process.RestrictAccessSync(path, false); err != nil {
		return shared.Keys{}, err
	}

	return shared.Keys{SecretKey: keys.ObjSk, PublicKey: keys.ObjPub, OpaqueSetup: setup}, nil
}

func PersistIdentity(dir string, data []byte) error {
	path := filepath.Join(dir, ".identity-"+uuid.NewString())
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	defer func() { _ = os.Remove(path) }()
	if err = os.Link(path, filepath.Join(dir, "identity.json")); err != nil {
		return err
	}
	if runtime.GOOS == "windows" {
		return nil
	}
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer func() { _ = d.Close() }()

	return d.Sync()
}
