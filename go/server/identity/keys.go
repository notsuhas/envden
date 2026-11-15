package identity

import (
	"bytes"
	"encoding/json"
	"github.com/google/uuid"
	e "github.com/notsuhas/envden/go/core/errors"
	process "github.com/notsuhas/envden/go/core/process"
	k "github.com/notsuhas/envden/go/core/protocol/keys"
	o "github.com/notsuhas/envden/go/core/protocol/opaque"
	x "github.com/notsuhas/envden/go/server/shared"
	"os"
	"path/filepath"
	"runtime"
)

type persisted struct {
	SecretKey   string `json:"secretKey"`
	PublicKey   string `json:"publicKey"`
	OpaqueSetup string `json:"opaqueSetup"`
}

func LoadServerKeys(dir string) (out x.Keys, err error) {
	defer func() {
		if v := recover(); v != nil {
			err = v.(error)
		}
	}()
	x.Check(os.MkdirAll(dir, 0700))
	x.Check(process.RestrictAccessSync(dir, true))
	path := filepath.Join(dir, "identity.json")
	raw, err := os.ReadFile(path)
	if err == nil {
		var data persisted
		x.Check(json.Unmarshal(raw, &data))
		x.Check(process.RestrictAccessSync(path, false))
		if data.SecretKey == "" || data.PublicKey == "" || data.OpaqueSetup == "" {
			x.Fail(e.InvalidData, "Invalid server identity")
		}
		sk, pub := x.Binary(data.SecretKey, 32), x.Binary(data.PublicKey, 32)
		derived := x.Must(k.GenerateRecoveryKeys(func(int) []byte { return sk }))
		if !bytes.Equal(pub, derived.ObjPub) {
			x.Fail(e.InvalidData, "Invalid server identity")
		}
		return x.Keys{SecretKey: sk, PublicKey: pub, OpaqueSetup: x.Must(o.OpaqueMessage(data.OpaqueSetup, 128))}, nil
	}
	if !os.IsNotExist(err) {
		return out, err
	}
	keys := x.Must(k.GenerateRecoveryKeys())
	setup := x.Must(o.OpaqueCreateSetup())
	x.Check(PersistIdentity(dir, x.JSON(persisted{x.Text(keys.ObjSk), x.Text(keys.ObjPub), setup})))
	x.Check(process.RestrictAccessSync(path, false))
	return x.Keys{SecretKey: keys.ObjSk, PublicKey: keys.ObjPub, OpaqueSetup: setup}, nil
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
	defer os.Remove(path)
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
	defer d.Close()
	return d.Sync()
}
