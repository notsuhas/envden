package files

import (
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type FileContext struct {
	VaultId []byte
	Epoch   int
	FileId  []byte
	Version uint64
}

func fileAD(label string, v FileContext) []byte {
	return b.Concat(b.Ctx(label), b.B32.Write(v.VaultId), b.U32.Write(v.Epoch), b.B32.Write(v.FileId), b.U64.Write(v.Version))
}

func seal[T any](codec b.Codec[T], v T, key []byte, ctx FileContext, label string, rng []c.Random) ([]byte, error) {
	return b.Try(func() []byte {
		return b.Must(c.SealBox(c.KDF(b.B32.Write(key), ctx.VaultId, label+"-key", ctx.FileId), b.Pad(codec.Write(v)), fileAD(label, ctx), rng...))
	})
}

func open[T any](codec b.Codec[T], box, key []byte, ctx FileContext, label string) T {
	return b.Must(b.DecodePadded(codec, b.Must(c.OpenBox(c.KDF(b.B32.Write(key), ctx.VaultId, label+"-key", ctx.FileId), box, fileAD(label, ctx)))))
}

func SealFileName(v d.FileName, key []byte, ctx FileContext, rng ...c.Random) ([]byte, error) {
	return seal(d.FileNameCodec, v, key, ctx, "file-name", rng)
}

func SealFile(v d.File, key []byte, ctx FileContext, rng ...c.Random) ([]byte, error) {
	return seal(d.FileCodec, v, key, ctx, "file", rng)
}

func OpenFileName(box, key, idKey []byte, ctx FileContext) (d.FileName, error) {
	return b.Try(func() d.FileName {
		v := open(d.FileNameCodec, box, key, ctx, "file-name")
		b.RequireValue(b.Equal(b.Must(FileID(idKey, v.RepoId, v.Path)), ctx.FileId), "File ID mismatch")

		return v
	})
}

func OpenFile(box, key, idKey []byte, ctx FileContext, blobHash []byte, name d.FileName) (d.File, error) {
	return b.Try(func() d.File {
		b.RequireValue(b.Equal(c.H("blob", box), blobHash), "Blob hash mismatch")
		v := open(d.FileCodec, box, key, ctx, "file")
		b.RequireValue(b.Equal(b.Must(FileID(idKey, v.RepoId, v.Path)), ctx.FileId), "File ID mismatch")
		b.RequireValue(v.RepoId == name.RepoId && v.Path == name.Path, "File name mismatch")

		return v
	})
}
