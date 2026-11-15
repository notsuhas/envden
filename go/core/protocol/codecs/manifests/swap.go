package manifests

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Swap struct {
	ExpectedHead []byte
	Entries      []encoding.Signed[codecs.Entry]
	Header       encoding.Signed[ManifestHeader]
	Files        *Files
	Keyring      *[]byte
	Envelope     *[]byte
	SkPub        *[]byte
	OpaqueRecord *[]byte
	Approver     *[]byte
}

var SwapCodec = encoding.NewCodec(func(r *encoding.Reader) Swap {
	return Swap{
		ExpectedHead: encoding.B32.Read(r),
		Entries:      encoding.List(encoding.SignedCodec(codecs.EntryCodec)).Read(r),
		Header:       encoding.SignedCodec(ManifestHeaderCodec).Read(r),
		Files:        encoding.Opt(FilesCodec).Read(r),
		Keyring:      encoding.Opt(encoding.Blob).Read(r),
		Envelope:     encoding.Opt(encoding.Blob).Read(r),
		SkPub:        encoding.Opt(encoding.B32).Read(r),
		OpaqueRecord: encoding.Opt(encoding.Bytes).Read(r),
		Approver:     encoding.Opt(encoding.Bytes).Read(r),
	}
}, func(v Swap) []byte {
	return encoding.Concat(
		encoding.B32.Write(v.ExpectedHead),
		encoding.List(encoding.SignedCodec(codecs.EntryCodec)).Write(v.Entries),
		encoding.SignedCodec(ManifestHeaderCodec).Write(v.Header),
		encoding.Opt(FilesCodec).Write(v.Files),
		encoding.Opt(encoding.Blob).Write(v.Keyring),
		encoding.Opt(encoding.Blob).Write(v.Envelope),
		encoding.Opt(encoding.B32).Write(v.SkPub),
		encoding.Opt(encoding.Bytes).Write(v.OpaqueRecord),
		encoding.Opt(encoding.Bytes).Write(v.Approver),
	)
}, nil)
