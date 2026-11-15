package manifests

import (
	codecs "github.com/notsuhas/envden/go/core/protocol/codecs"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Swap struct {
	ExpectedHead []byte
	Entries      []b.Signed[codecs.Entry]
	Header       b.Signed[ManifestHeader]
	Files        *Files
	Keyring      *[]byte
	Envelope     *[]byte
	SkPub        *[]byte
	OpaqueRecord *[]byte
	Approver     *[]byte
}

var SwapCodec = b.NewCodec(func(r *b.Reader) Swap {
	return Swap{
		ExpectedHead: b.B32.Read(r),
		Entries:      b.List(b.SignedCodec(codecs.EntryCodec)).Read(r),
		Header:       b.SignedCodec(ManifestHeaderCodec).Read(r),
		Files:        b.Opt(FilesCodec).Read(r),
		Keyring:      b.Opt(b.Blob).Read(r),
		Envelope:     b.Opt(b.Blob).Read(r),
		SkPub:        b.Opt(b.B32).Read(r),
		OpaqueRecord: b.Opt(b.Bytes).Read(r),
		Approver:     b.Opt(b.Bytes).Read(r),
	}
}, func(v Swap) []byte {
	return b.Concat(
		b.B32.Write(v.ExpectedHead),
		b.List(b.SignedCodec(codecs.EntryCodec)).Write(v.Entries),
		b.SignedCodec(ManifestHeaderCodec).Write(v.Header),
		b.Opt(FilesCodec).Write(v.Files),
		b.Opt(b.Blob).Write(v.Keyring),
		b.Opt(b.Blob).Write(v.Envelope),
		b.Opt(b.B32).Write(v.SkPub),
		b.Opt(b.Bytes).Write(v.OpaqueRecord),
		b.Opt(b.Bytes).Write(v.Approver),
	)
}, nil)
