package identity

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	k "github.com/notsuhas/envden/go/core/protocol/keys"
	p "github.com/notsuhas/envden/go/core/protocol/proofs"
	x "github.com/notsuhas/envden/go/server/shared"
)

func InitializeSetup(storage a.Storage, pub []byte, replacement string) (token string, err error) {
	defer func() {
		if v := recover(); v != nil {
			err = v.(error)
		}
	}()
	pin := x.Must(k.ServerPin(pub))
	namespace := make([]byte, 32)
	key := []byte{}
	if replacement == "" && (x.Must(storage.SetupToken()) != nil || x.Must(storage.State(namespace, a.StateSetupIssued, key)) != nil || len(x.Must(storage.VaultIDs())) > 0) {
		return "", nil
	}
	var secret []byte
	if replacement != "" {
		t := x.Must(p.DecodeToken("setup", replacement))
		secret = t.Secret
		if !bytes.Equal(t.ServerPin, pin) {
			x.Fail(e.InvalidInput, "Setup token pin mismatch")
		}
	} else {
		secret = c.RandomBytes(20)
	}
	x.Transaction(storage, func() bool {
		x.Check(storage.SetSetupToken(x.Must(p.TokenKey("setup", secret))))
		x.Check(storage.WriteState(namespace, []a.StateWrite{{Kind: a.StateSetupIssued, Key: key, Bytes: []byte{1}}}))
		return true
	})
	return x.Must(p.EncodeToken("setup", secret, pin)), nil
}
func ReissueSetup(storage a.Storage, pub []byte) (string, error) {
	ids, err := storage.VaultIDs()
	if err != nil {
		return "", err
	}
	if len(ids) > 0 {
		return "", nil
	}
	pin, err := k.ServerPin(pub)
	if err != nil {
		return "", err
	}
	token, err := p.EncodeToken("setup", c.RandomBytes(20), pin)
	if err != nil {
		return "", err
	}
	return InitializeSetup(storage, pub, token)
}
