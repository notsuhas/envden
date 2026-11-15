package protocol_test

import (
	"bytes"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	coreprotocolcodecspairing "github.com/notsuhas/envden/go/core/protocol/codecs/pairing"
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
	"github.com/notsuhas/envden/go/core/protocol/requests"
)

func TestFileAndEnvelopeBindings(t *testing.T) {
	v := vector(t)
	key, vault, secret := vb(v, "key"), vb(v, "vaultId"), vb(v, "secret")
	z := make([]byte, 32)
	ctx := files.FileContext{VaultId: vault, Epoch: 1, FileId: vb(v, "fileId"), Version: 1}
	box := vb(v, "fileBox")
	hash := crypto.H("blob", box)
	name := content.FileName{RepoId: "repo", Path: "folder/.env"}
	wrong := ctx
	wrong.Version = 2
	_, err := files.OpenFile(box, key, key, wrong, hash, name)
	reject(t, err)
	_, err = files.OpenFile(box, key, z, ctx, hash, name)
	reject(t, err)
	_, err = files.OpenFile(box, key, key, ctx, z, name)
	reject(t, err)
	_, err = files.OpenFile(box, key, key, ctx, hash, content.FileName{RepoId: "repo", Path: "other"})
	reject(t, err)
	_, err = files.OpenFileName(vb(v, "fileNameBox"), key, z, ctx)
	reject(t, err)
	for _, path := range []string{"", "/a", "a/", "../../__tests__/a", "/root", "a//b", "a/./b", "a/../b", "C:secret", "a:x", "a\\b", "a./b", "a /b", "CON", "nul.env", "dir/COM1.txt", "LPT9", "a\x01b", "a\u0085b", "e\u0301"} {
		_, err = files.FileID(key, "repo", path)
		reject(t, err)
	}
	eq(t, encoding.Equal(must(files.FileID(key, "repo", "A")), must(files.FileID(key, "repo", "a"))), false)
	for _, path := range []string{"folder/.env", "é/.env", "console.env", "COM10.env"} {
		if err := files.ValidatePath(path); err != nil {
			t.Fatal(err)
		}
	}
	_, err = envelope.OpenEnvelope(vb(v, "envelopeBox"), "wrong", secret, vault)
	reject(t, err)
	_, err = envelope.OpenEnvelope(vb(v, "envelopeBox"), "password", make([]byte, 16), vault)
	reject(t, err)
	_, err = keyring.OpenKeyring(vb(v, "keyringBox"), key, vault, 1, nil, nil)
	reject(t, err)
	_, err = keyring.OpenKeyring(vb(v, "keyringBox"), key, vault, 1, map[int][]byte{1: must(epochs.KeyCommit(key, vault, 1))}, z)
	reject(t, err)
}

func TestRequestAndProofBindings(t *testing.T) {
	req := request(t)
	req.Time = 1000000
	k := must(keys.GenerateDeviceKeys(rng))
	signed := must(requests.SignRequest(req, k.ReqSk))
	key := rng(32)
	pin := req.ServerPin
	for _, now := range []uint64{1000000, 1299999} {
		eq(t, must(requests.VerifyRequest(signed, k.ReqPub, pin, key, now, false)).OK, true)
	}
	for _, now := range []uint64{1300000, 700000} {
		eq(t, must(requests.VerifyRequest(signed, k.ReqPub, pin, key, now, false)).OK, false)
	}
	eq(t, must(requests.VerifyRequest(signed, k.ReqPub, pin, key, 1000000, true)).OK, false)
	eq(t, must(requests.VerifyRequest(signed, k.ReqPub, make([]byte, 32), key, 1000000, false)).OK, false)
	eq(t, must(requests.VerifyRequest(signed, k.ReqPub, pin, nil, 1000000, false)).OK, false)
	eq(t, must(requests.VerifyRequestHash(signed, k.ReqPub, pin, req.BodyHash, 1000000, false)).OK, true)
	eq(t, must(requests.VerifyRequestHash(signed, k.ReqPub, pin, key, 1000000, false)).OK, false)
	z := make([]byte, 32)
	hello := must(requests.BuildHello(wire.ServerHello{Challenge: z, Host: "server", ServerSignPub: k.ObjPub, AppVersion: "1.0.0", MinClient: "1.0.0", Protocols: []int{1}}, k.ObjSk))
	eq(t, requests.VerifyHello(hello, z, "SERVER", pin, "1.0.0").OK, true)
	eq(t, requests.VerifyHello(hello, z, "other", pin, "1.0.0").OK, false)
	eq(t, requests.VerifyHello(hello, z, "server", pin, "1.0.1").OK, false)
	eq(t, requests.VerifyHello(hello, z, "server", z, "1.0.0").OK, false)
	token := bytes.Repeat([]byte{3}, 20)
	setup := must(proofs.TokenKey("setup", token))
	repair := must(proofs.TokenKey("repair", token))
	proof := must(proofs.TokenProof("setup", setup, req))
	eq(t, must(proofs.VerifyTokenProof("setup", setup, req, proof)).OK, true)
	eq(t, must(proofs.VerifyTokenProof("repair", repair, req, proof)).OK, false)
	sk := make([]byte, 16)
	sig := must(proofs.SignSKProof(sk, z, req))
	pub := must(keys.SKPub(sk, z))
	eq(t, must(proofs.VerifySKProof(pub, req, sig)).OK, true)
	eq(t, crypto.Verify(pub, "request", must(encoding.Encode(wire.RequestCodec, req)), sig).OK, false)
	text := must(proofs.EncodeToken("setup", token, pin))
	eq(t, proofs.IsToken("setup", " "+text[:40]+"\n"+strings.ToLower(text[40:])+" "), true)
	eq(t, proofs.IsToken("setup", text+"\u0085"), false)
}

func TestPairingBindings(t *testing.T) {
	eq(t, must(pairing.NormalizePairingCode("1-ooil-0000")), pairing.Code{Mailbox: 1, Password: "00110000"})
	for _, text := range []string{"01-0000-0000", "0-0000-0000", "1000-0000-0000", "1-!!!!-0000", "12-ABCD-EFG", "999-0000-000", "12 ABCD EFG", "1-0000-00000", "1-ſ000-0000"} {
		_, err := pairing.NormalizePairingCode(text)
		reject(t, err)
		eq(t, err.Error(), "Codes look like 3-K7QF-2MXP")
	}
	for _, text := range []string{"12-ABCD-EFGH", "12 ABCD EFGH", "12ABCDEFGH"} {
		eq(t, must(pairing.NormalizePairingCode(text)), pairing.Code{Mailbox: 12, Password: "ABCDEFGH"})
	}
	channel := must(pairing.PairingChannelKeys(make([]byte, 64)))
	eq(t, encoding.Equal(channel.JoinerToApprover, channel.ApproverToJoiner), false)
	box := must(crypto.SealBox(channel.JoinerToApprover, rng(32), nil, rng))
	eq(t, must(crypto.OpenBox(channel.JoinerToApprover, box, nil)), rng(32))
	_, err := crypto.OpenBox(channel.ApproverToJoiner, box, nil)
	reject(t, err)
	d, _, _, _, _ := fixtures()
	key := make([]byte, 32)
	join := coreprotocolcodecspairing.PairJoiner{Device: d}
	jbox := must(pairing.SealPairJoiner(join, key))
	eq(t, must(pairing.OpenPairJoiner(jbox, key)), join)
	_, err = pairing.OpenPairApprover(jbox, key)
	reject(t, err)
	approver := coreprotocolcodecspairing.PairApprover{VaultId: key, ServerPin: key, ManifestHash: key}
	abox := must(pairing.SealPairApprover(approver, key))
	eq(t, must(pairing.OpenPairApprover(abox, key)), approver)
	_, err = pairing.OpenPairJoiner(abox, key)
	reject(t, err)
	_, err = pairing.OpenPairJoiner(make([]byte, 4097), key)
	reject(t, err)
}
