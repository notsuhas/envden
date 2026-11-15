package protocol_test

import (
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/hpke"
	"crypto/sha256"
	"encoding/json"
	"testing"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/chacha20poly1305"
)

func TestKnownVectors(t *testing.T) {

	raw := load[map[string]json.RawMessage](t, "known")
	part := func(k string) map[string]any {
		var m map[string]any
		must(0, json.Unmarshal(raw[k], &m))

		return m
	}
	get := func(m map[string]any, k string) []byte { return from(m[k].(string)) }
	m := part("hkdf")
	eq(t, must(hkdf.Key(sha256.New, get(m, "ikm"), get(m, "salt"), string(get(m, "info")), 42)), get(m, "okm"))
	m = part("hmac")
	h := hmac.New(sha256.New, get(m, "key"))
	h.Write([]byte(m["message"].(string)))
	eq(t, h.Sum(nil), get(m, "hash"))
	m = part("ed25519")
	sk := ed25519.NewKeyFromSeed(get(m, "seed"))
	eq(t, []byte(sk.Public().(ed25519.PublicKey)), get(m, "public"))
	eq(t, ed25519.Sign(sk, nil), get(m, "signature"))
	m = part("x25519")
	eq(t, must(ecdh.X25519().NewPrivateKey(get(m, "secret"))).PublicKey().Bytes(), get(m, "public"))
	m = part("xchacha")
	a := must(chacha20poly1305.NewX(get(m, "key")))
	pt := []byte(m["message"].(string))
	eq(t, a.Seal(nil, get(m, "nonce"), pt, get(m, "ad")), get(m, "ct"))
	eq(t, must(a.Open(nil, get(m, "nonce"), get(m, "ct"), get(m, "ad"))), pt)
	m = part("argon2id")
	eq(t, argon2.IDKey([]byte(m["password"].(string)), []byte(m["salt"].(string)), 2, 256, 1, 32), get(m, "hash"))
	m = part("hpke")
	kem := hpke.DHKEM(ecdh.X25519())
	r := must(hpke.NewRecipient(get(m, "enc"), must(kem.NewPrivateKey(get(m, "skRm"))), hpke.HKDFSHA256(), hpke.ChaCha20Poly1305(), get(m, "info")))
	eq(t, must(r.Open(get(m, "aad"), get(m, "ct"))), get(m, "pt"))
	eq(t, get(m, "enc"), get(m, "pkEm"))
	eq(t, must(ecdh.X25519().NewPrivateKey(get(m, "skEm"))).PublicKey().Bytes(), get(m, "enc"))
}
