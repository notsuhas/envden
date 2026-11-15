package manifests

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type FileEntry struct {
	FileId   []byte
	Version  uint64
	Epoch    int
	State    int
	BlobHash []byte
	Name     []byte
}

var FileEntryCodec = encoding.NewCodec(func(r *encoding.Reader) FileEntry {
	return FileEntry{
		FileId:   encoding.B32.Read(r),
		Version:  encoding.U64.Read(r),
		Epoch:    encoding.U32.Read(r),
		State:    encoding.U8.Read(r),
		BlobHash: encoding.B32.Read(r),
		Name:     encoding.Bytes.Read(r),
	}
}, func(v FileEntry) []byte {
	return encoding.Concat(
		encoding.B32.Write(v.FileId),
		encoding.U64.Write(v.Version),
		encoding.U32.Write(v.Epoch),
		encoding.U8.Write(v.State),
		encoding.B32.Write(v.BlobHash),
		encoding.Bytes.Write(v.Name),
	)
}, func(v FileEntry) {
	encoding.RequireValue(v.State >= 1 && v.State <= 4, "Unknown file state")
	encoding.RequireValue(v.Version >= 1 && v.Epoch >= 1)
	zero := true
	for _, x := range v.BlobHash {
		zero = zero && x == 0
	}
	encoding.RequireValue((v.State == 2 || v.State == 4) == zero, "Blob hash does not match file state")
})
