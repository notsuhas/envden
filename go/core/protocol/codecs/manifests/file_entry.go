package manifests

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type FileEntry struct {
	FileId   []byte
	Version  uint64
	Epoch    int
	State    int
	BlobHash []byte
	Name     []byte
}

var FileEntryCodec = b.NewCodec(func(r *b.Reader) FileEntry {
	return FileEntry{
		FileId:   b.B32.Read(r),
		Version:  b.U64.Read(r),
		Epoch:    b.U32.Read(r),
		State:    b.U8.Read(r),
		BlobHash: b.B32.Read(r),
		Name:     b.Bytes.Read(r),
	}
}, func(v FileEntry) []byte {
	return b.Concat(
		b.B32.Write(v.FileId),
		b.U64.Write(v.Version),
		b.U32.Write(v.Epoch),
		b.U8.Write(v.State),
		b.B32.Write(v.BlobHash),
		b.Bytes.Write(v.Name),
	)
}, func(v FileEntry) {
	b.RequireValue(v.State >= 1 && v.State <= 4, "Unknown file state")
	b.RequireValue(v.Version >= 1 && v.Epoch >= 1)
	zero := true
	for _, x := range v.BlobHash {
		zero = zero && x == 0
	}
	b.RequireValue((v.State == 2 || v.State == 4) == zero, "Blob hash does not match file state")
})
