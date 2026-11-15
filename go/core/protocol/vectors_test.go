package protocol_test

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	coreprotocolcodecsepochs "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/envelope"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
	"github.com/notsuhas/envden/go/core/protocol/files"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/pairing"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
)

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}

	return v
}

func load[T any](t *testing.T, file string) T {
	t.Helper()
	raw, err := os.ReadFile("testdata/" + file + ".json")
	if err != nil {
		t.Fatal(err)
	}
	var v T
	if err = json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}

	return v
}

func from(s string) []byte { return must(hex.DecodeString(s)) }

func rng(n int) []byte {
	v := make([]byte, n)
	for i := range v {
		v[i] = byte(i)
	}

	return v
}

func eq[T any](t *testing.T, a, c T) {
	t.Helper()
	if !reflect.DeepEqual(a, c) {
		t.Fatalf("values differ: %v != %v", a, c)
	}
}

func reject(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("accepted malformed input")
	}
}

func vector(t *testing.T) map[string]json.RawMessage {
	return load[map[string]json.RawMessage](t, "protocol")
}

func vs(v map[string]json.RawMessage, k string) string {
	var s string
	must(0, json.Unmarshal(v[k], &s))

	return s
}

func vb(v map[string]json.RawMessage, k string) []byte { return from(vs(v, k)) }

func request(t *testing.T) wire.Request {
	v := vector(t)

	return wire.Request{
		ServerPin:     vb(v, "serverPin"),
		VaultId:       vb(v, "vaultId"),
		Method:        "POST",
		PathAndQuery:  "/swap",
		BodyHash:      crypto.SHA256(vb(v, "key")),
		Time:          1,
		Nonce:         vb(v, "secret"),
		Device:        vb(v, "deviceId"),
		ClientVersion: "1.0.0",
	}
}

func TestProtocolVectors(t *testing.T) {
	v := vector(t)
	key, vault, secret := vb(v, "key"), vb(v, "vaultId"), vb(v, "secret")
	check := func(k string, got []byte) {
		t.Helper()
		eq(t, hex.EncodeToString(got), vs(v, k))
	}
	keysD := must(keys.GenerateDeviceKeys(rng))
	check("edPublic", keysD.ObjPub)
	check("xPublic", keysD.EncPub)
	check("deviceId", must(keys.DeviceID(keysD.EncPub, keysD.ObjPub, keysD.ReqPub)))
	check("recoveryId", must(keys.RecoveryID(keysD.EncPub, keysD.ObjPub)))
	check("serverPin", must(keys.ServerPin(keysD.ObjPub)))
	check("skPub", must(keys.SKPub(secret, vault)))
	eq(t, must(keys.EncodeSecretKey(secret)), vs(v, "secretText"))
	eq(t, must(keys.DecodeSecretKey(vs(v, "secretText"))), secret)
	_, err := keys.DecodeSecretKey(vs(v, "secretText")[:len(vs(v, "secretText"))-1] + "Z")
	reject(t, err)
	token := bytes.Repeat([]byte{7}, 20)
	eq(t, must(proofs.EncodeToken("setup", token, vb(v, "serverPin"))), vs(v, "setupToken"))
	eq(t, must(proofs.DecodeToken("setup", vs(v, "setupToken"))).Secret, token)
	_, err = proofs.DecodeToken("repair", vs(v, "setupToken"))
	reject(t, err)
	eq(t, must(pairing.GeneratePairingCode(1, rng)), vs(v, "pairingCode"))
	fid := must(files.FileID(key, "repo", "folder/.env"))
	check("fileId", fid)
	ctx := files.FileContext{VaultId: vault, Epoch: 1, FileId: fid, Version: 1}
	file := content.File{RepoId: "repo", Path: "folder/.env", Content: []byte("SECRET=value\n")}
	name := content.FileName{RepoId: file.RepoId, Path: file.Path}
	check("fileBox", must(files.SealFile(file, key, ctx, rng)))
	check("fileNameBox", must(files.SealFileName(name, key, ctx, rng)))
	eq(t, must(files.OpenFileName(vb(v, "fileNameBox"), key, key, ctx)), name)
	eq(t, must(files.OpenFile(vb(v, "fileBox"), key, key, ctx, crypto.H("blob", vb(v, "fileBox")), name)), file)
	check("fileKey", crypto.KDF(key, vault, "file-key", fid))
	check("keyringKey", crypto.KDF(key, vault, "keyring-key", encoding.U32.Write(1)))
	kr := coreprotocolcodecsepochs.Keyring{VaultId: vault, Epoch: 1, IdKey: key, Older: []coreprotocolcodecsepochs.OlderKey{}}
	check("keyringBox", must(keyring.SealKeyring(kr, key, rng)))
	commits := map[int][]byte{1: must(epochs.KeyCommit(key, vault, 1))}
	eq(t, must(keyring.OpenKeyring(vb(v, "keyringBox"), key, vault, 1, commits, key)), kr)
	env := must(envelope.OpenEnvelope(vb(v, "envelopeBox"), "password", secret, vault))
	check("envelopeBox", must(envelope.SealEnvelope(env, "password", secret, rng)))
	check("envelopeKey", crypto.KDF(encoding.Concat(must(envelope.PasswordKey("password", secret)), secret), vault, "envelope-key"))
	check("signature", must(crypto.Sign(key, "entry", key)))
	check("repairId", crypto.H("repair-id", token))
	req := request(t)
	check("setupProof", must(proofs.TokenProof("setup", must(proofs.TokenKey("setup", token)), req)))
	check("repairProof", must(proofs.TokenProof("repair", must(proofs.TokenKey("repair", token)), req)))
	check("skProof", must(proofs.SignSKProof(secret, vault, req)))
	var wrap map[string]string
	must(0, json.Unmarshal(v["wrap"], &wrap))
	w := coreprotocolcodecsepochs.Wrap{Recipient: from(wrap["recipient"]), Enc: from(wrap["enc"]), Ct: from(wrap["ct"])}
	eq(t, w.Enc, keysD.EncPub)
	eq(t, must(epochs.OpenWrap(w, keysD.EncSk, keysD.EncPub, vault, 1, commits[1])), key)
	randomWrap := must(epochs.SealWrap(key, vault, 1, w.Recipient, keysD.EncPub))
	eq(t, must(epochs.OpenWrap(randomWrap, keysD.EncSk, keysD.EncPub, vault, 1, commits[1])), key)
}
