package files

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type FileContext struct {
	VaultId []byte
	Epoch   int
	FileId  []byte
	Version uint64
}

func fileAD(label string, v FileContext) []byte {
	return encoding.Concat(encoding.Ctx(label), encoding.B32.Write(v.VaultId), encoding.U32.Write(v.Epoch), encoding.B32.Write(v.FileId), encoding.U64.Write(v.Version))
}

func seal[T any](codec encoding.Codec[T], v T, key []byte, ctx FileContext, label string, rng []crypto.Random) ([]byte, error) {
	return encoding.Try(func() []byte {
		return encoding.Must(crypto.SealBox(crypto.KDF(encoding.B32.Write(key), ctx.VaultId, label+"-key", ctx.FileId), encoding.Pad(codec.Write(v)), fileAD(label, ctx), rng...))
	})
}

func open[T any](codec encoding.Codec[T], box, key []byte, ctx FileContext, label string) T {
	return encoding.Must(encoding.DecodePadded(codec, encoding.Must(crypto.OpenBox(crypto.KDF(encoding.B32.Write(key), ctx.VaultId, label+"-key", ctx.FileId), box, fileAD(label, ctx)))))
}

func SealFileName(v content.FileName, key []byte, ctx FileContext, rng ...crypto.Random) ([]byte, error) {
	return seal(content.FileNameCodec, v, key, ctx, "file-name", rng)
}

func SealFile(v content.File, key []byte, ctx FileContext, rng ...crypto.Random) ([]byte, error) {
	return seal(content.FileCodec, v, key, ctx, "file", rng)
}

func OpenFileName(box, key, idKey []byte, ctx FileContext) (content.FileName, error) {
	return encoding.Try(func() content.FileName {
		v := open(content.FileNameCodec, box, key, ctx, "file-name")
		encoding.RequireValue(encoding.Equal(encoding.Must(FileID(idKey, v.RepoId, v.Path)), ctx.FileId), "File ID mismatch")

		return v
	})
}

func OpenFile(box, key, idKey []byte, ctx FileContext, blobHash []byte, name content.FileName) (content.File, error) {
	return encoding.Try(func() content.File {
		encoding.RequireValue(encoding.Equal(crypto.H("blob", box), blobHash), "Blob hash mismatch")
		v := open(content.FileCodec, box, key, ctx, "file")
		encoding.RequireValue(encoding.Equal(encoding.Must(FileID(idKey, v.RepoId, v.Path)), ctx.FileId), "File ID mismatch")
		encoding.RequireValue(v.RepoId == name.RepoId && v.Path == name.Path, "File name mismatch")

		return v
	})
}
