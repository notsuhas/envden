package epochs

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Keyring struct {
	VaultId []byte
	Epoch   int
	IdKey   []byte
	Older   []OlderKey
}

var KeyringCodec = encoding.NewCodec(func(r *encoding.Reader) Keyring {
	encoding.Tagged(4, r)

	return Keyring{
		VaultId: encoding.B32.Read(r),
		Epoch:   encoding.U32.Read(r),
		IdKey:   encoding.B32.Read(r),
		Older:   encoding.List(OlderKeyCodec, func(a, c OlderKey) int { return a.Epoch - c.Epoch }).Read(r),
	}
}, func(v Keyring) []byte {
	return encoding.Concat(
		encoding.Header(4),
		encoding.B32.Write(v.VaultId),
		encoding.U32.Write(v.Epoch),
		encoding.B32.Write(v.IdKey),
		encoding.List(OlderKeyCodec, func(a, c OlderKey) int { return a.Epoch - c.Epoch }).Write(v.Older),
	)
}, func(v Keyring) {
	encoding.RequireValue(v.Epoch >= 1 && len(v.Older) == v.Epoch-1, "Noncontiguous epochs")
	for i, k := range v.Older {
		encoding.RequireValue(k.Epoch == i+1, "Noncontiguous epochs")
	}
})
