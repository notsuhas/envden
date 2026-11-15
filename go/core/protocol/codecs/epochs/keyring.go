package epochs

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Keyring struct {
	VaultId []byte
	Epoch   int
	IdKey   []byte
	Older   []OlderKey
}

var KeyringCodec = b.NewCodec(func(r *b.Reader) Keyring {
	b.Tagged(4, r)

	return Keyring{
		VaultId: b.B32.Read(r),
		Epoch:   b.U32.Read(r),
		IdKey:   b.B32.Read(r),
		Older:   b.List(OlderKeyCodec, func(a, c OlderKey) int { return a.Epoch - c.Epoch }).Read(r),
	}
}, func(v Keyring) []byte {
	return b.Concat(
		b.Header(4),
		b.B32.Write(v.VaultId),
		b.U32.Write(v.Epoch),
		b.B32.Write(v.IdKey),
		b.List(OlderKeyCodec, func(a, c OlderKey) int { return a.Epoch - c.Epoch }).Write(v.Older),
	)
}, func(v Keyring) {
	b.RequireValue(v.Epoch >= 1 && len(v.Older) == v.Epoch-1, "Noncontiguous epochs")
	for i, k := range v.Older {
		b.RequireValue(k.Epoch == i+1, "Noncontiguous epochs")
	}
})
