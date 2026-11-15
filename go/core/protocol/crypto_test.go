package protocol_test

import (
	"bytes"
	"crypto/sha512"
	"math/big"
	"testing"

	"filippo.io/edwards25519"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func TestStrictSignatures(t *testing.T) {
	key := rng(32)
	k := must(keys.GenerateDeviceKeys(rng))
	labels := []string{"entry", "manifest", "repair-report", "request", "server-hello", "sk-proof"}
	for _, label := range labels {
		sig := must(crypto.Sign(key, label, key))
		for _, other := range labels {
			eq(t, crypto.Verify(k.ObjPub, other, key, sig).OK, label == other)
		}
	}
	reject(t, keys.ValidateEdPublic(make([]byte, 32)))
	eq(t, crypto.Verify(make([]byte, 32), "entry", key, make([]byte, 64)).OK, false)
	r := bytes.Repeat([]byte{255}, 32)
	r[0] = 238
	r[31] = 127
	pub := edwards25519.NewGeneratorPoint().Bytes()
	digest := sha512.Sum512(encoding.Concat(r, pub, crypto.Frame("entry", key)))
	reverse := func(v []byte) []byte {
		out := bytes.Clone(v)
		for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
			out[i], out[j] = out[j], out[i]
		}

		return out
	}
	order, _ := new(big.Int).SetString("1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed", 16)
	challenge := new(big.Int).Mod(new(big.Int).SetBytes(reverse(digest[:])), order)
	scalar := reverse(challenge.FillBytes(make([]byte, 32)))
	eq(t, crypto.Verify(pub, "entry", key, encoding.Concat(r, scalar)).OK, false)
	sig := must(crypto.Sign(key, "entry", key))
	s := new(big.Int).SetBytes(reverse(sig[32:]))
	s.Add(s, order)
	eq(t, crypto.Verify(k.ObjPub, "entry", key, encoding.Concat(sig[:32], reverse(s.FillBytes(make([]byte, 32))))).OK, false)
	eq(t, crypto.Verify(k.ObjPub, "entry", key, make([]byte, 63)).OK, false)
	box := must(crypto.SealBox(key, key, nil, rng))
	_, err := crypto.OpenBox(make([]byte, 32), box, nil)
	if x, ok := enverrors.As(err); !ok || x.Message != "Unable to decrypt box" || x.Cause == nil {
		t.Fatal("wrong decryption error")
	}
	_, err = crypto.OpenBox(key, []byte{2}, nil)
	reject(t, err)
	failure := "programmer failure"
	codec := encoding.Codec[[]byte]{Write: func([]byte) []byte { panic(failure) }}
	func() {
		defer func() { eq(t, recover(), any(failure)) }()
		_, _ = crypto.VerifyObject(codec, encoding.Signed[[]byte]{Body: key}, k.ObjPub, "entry")
	}()
}

func TestEncryptionKeyRejections(t *testing.T) {
	k := must(keys.GenerateDeviceKeys(rng))
	key := rng(32)
	vault := make([]byte, 32)
	id := must(keys.DeviceID(k.EncPub, k.ObjPub, k.ReqPub))
	high := bytes.Clone(k.EncPub)
	high[31] |= 128
	over := bytes.Repeat([]byte{255}, 32)
	over[0] = 246
	over[31] = 127
	one := make([]byte, 32)
	one[0] = 1
	low := from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800")
	for _, pub := range [][]byte{high, over, make([]byte, 32), one, low} {
		reject(t, keys.ValidateEncPublic(pub))
	}
	for _, pub := range [][]byte{make([]byte, 31), make([]byte, 32), low} {
		_, err := epochs.SealWrap(key, vault, 1, id, pub)
		x, ok := enverrors.As(err)
		if !ok || x.Message != "Unable to encrypt wrap" || x.Cause == nil {
			t.Fatal("wrong wrap error")
		}
	}
	w := must(epochs.SealWrap(key, vault, 1, id, k.EncPub))
	commit := must(epochs.KeyCommit(key, vault, 1))
	_, err := epochs.OpenWrap(w, make([]byte, 32), k.EncPub, vault, 1, commit)
	x, ok := enverrors.As(err)
	if !ok || x.Message != "Unable to decrypt wrap" || x.Cause == nil {
		t.Fatal("wrong open error")
	}
	_, err = epochs.OpenWrap(w, k.EncSk, k.EncPub, vault, 1, make([]byte, 32))
	reject(t, err)
}
