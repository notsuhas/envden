package vault

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/envelope"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

type SetupKit struct {
	SecretKey      string `json:"secretKey"`
	VaultID        string `json:"vaultId"`
	Server         string `json:"server"`
	MasterPassword string `json:"masterPassword"`
}

func CreateVaultSwap(material Genesis, identity identity.Identity, password, record string, now int64) (m.Swap, SetupKit, error) {
	var kit SetupKit
	swap, err := b.Try(func() m.Swap {
		secret := c.RNG(nil)(16)
		box := b.Must(envelope.SealEnvelope(content.Envelope{VaultId: material.VaultID, RecoveryEncSk: material.RecoveryKeys.EncSk, RecoveryObjSk: material.RecoveryKeys.ObjSk, Checkpoint: make([]byte, 32), SealedAt: uint64(now)}, password, secret))
		files := m.Files{Entries: []m.FileEntry{}}
		header := b.Must(c.SignObject(m.ManifestHeaderCodec, m.ManifestHeader{VaultId: material.VaultID, Seq: 1, Prev: make([]byte, 32), ListSeq: 1, ListHead: b.Must(c.ObjectHash(codecs.EntryCodec, material.Epoch, "entry")), Epoch: 1, KeyringHash: c.H("keyring-blob", material.Keyring), FilesHash: c.H("files", b.Must(b.Encode(m.FilesCodec, files))), EnvelopeHash: c.H("envelope-blob", box), CreatedAt: uint64(now), Signer: identity.Record.Id}, identity.Keys.ObjSk, "manifest"))
		pub := b.Must(keys.SKPub(secret, material.VaultID))
		opaque := b.Must(client.Binary(record))
		kit = SetupKit{SecretKey: b.Must(keys.EncodeSecretKey(secret)), VaultID: b.Base32(material.VaultID)}
		return m.Swap{ExpectedHead: make([]byte, 32), Entries: []b.Signed[codecs.Entry]{material.Genesis, material.Epoch}, Header: header, Files: &files, Keyring: &material.Keyring, Envelope: &box, SkPub: &pub, OpaqueRecord: &opaque}
	})
	return swap, kit, err
}
