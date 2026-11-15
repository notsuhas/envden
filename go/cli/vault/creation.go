package vault

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/envelope"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

type SetupKit struct {
	SecretKey      string `json:"secretKey"`
	VaultID        string `json:"vaultId"`
	Server         string `json:"server"`
	MasterPassword string `json:"masterPassword"`
}

func CreateVaultSwap(material Genesis, identity identity.Identity, password, record string, now int64) (manifests.Swap, SetupKit, error) {
	var kit SetupKit
	swap, err := encoding.Try(func() manifests.Swap {
		secret := crypto.RNG(nil)(16)
		box := encoding.Must(envelope.SealEnvelope(content.Envelope{VaultId: material.VaultID, RecoveryEncSk: material.RecoveryKeys.EncSk, RecoveryObjSk: material.RecoveryKeys.ObjSk, Checkpoint: make([]byte, 32), SealedAt: uint64(now)}, password, secret)) //nolint:gosec // Unix millisecond clock values are nonnegative.
		files := manifests.Files{Entries: []manifests.FileEntry{}}
		header := encoding.Must(crypto.SignObject(manifests.ManifestHeaderCodec, manifests.ManifestHeader{VaultId: material.VaultID, Seq: 1, Prev: make([]byte, 32), ListSeq: 1, ListHead: encoding.Must(crypto.ObjectHash(codecs.EntryCodec, material.Epoch, "entry")), Epoch: 1, KeyringHash: crypto.H("keyring-blob", material.Keyring), FilesHash: crypto.H("files", encoding.Must(encoding.Encode(manifests.FilesCodec, files))), EnvelopeHash: crypto.H("envelope-blob", box), CreatedAt: uint64(now), Signer: identity.Record.Id}, identity.Keys.ObjSk, "manifest")) //nolint:gosec // Unix millisecond clock values are nonnegative.
		pub := encoding.Must(keys.SKPub(secret, material.VaultID))
		opaque := encoding.Must(client.Binary(record))
		kit = SetupKit{SecretKey: encoding.Must(keys.EncodeSecretKey(secret)), VaultID: encoding.Base32(material.VaultID)}

		return manifests.Swap{ExpectedHead: make([]byte, 32), Entries: []encoding.Signed[codecs.Entry]{material.Genesis, material.Epoch}, Header: header, Files: &files, Keyring: &material.Keyring, Envelope: &box, SkPub: &pub, OpaqueRecord: &opaque}
	})

	return swap, kit, err
}
