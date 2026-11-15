package shared

import (
	"github.com/notsuhas/envden/go/cli/identity"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func AdminSwap(h History, id identity.Identity, op int, now int64, fields m.Swap) (m.Swap, error) {
	before := h.Headers[len(h.Headers)-1]
	head := HeaderHash(before)
	body := before.Body
	body.Seq++
	body.Prev = head
	body.Op = op
	body.CreatedAt = uint64(now)
	body.Signer = id.Record.Id
	if len(fields.Entries) > 0 {
		last := fields.Entries[len(fields.Entries)-1]
		body.ListSeq = last.Body.Seq
		body.ListHead = EntryHash(last)
		switch payload := last.Body.Payload.(type) {
		case p.RemoveDevice:
			body.Epoch = payload.Change.Epoch
		case p.NewEpoch:
			body.Epoch = payload.Change.Epoch
		case p.ReplaceRecovery:
			body.Epoch = payload.Change.Epoch
		}
	}
	if fields.Keyring != nil {
		body.KeyringHash = crypto.H("keyring-blob", *fields.Keyring)
	}
	if fields.Envelope != nil {
		body.EnvelopeHash = crypto.H("envelope-blob", *fields.Envelope)
	}
	if fields.Files != nil {
		raw, err := b.Encode(m.FilesCodec, *fields.Files)
		if err != nil {
			return fields, err
		}
		body.FilesHash = crypto.H("files", raw)
	}
	header, err := crypto.SignObject(m.ManifestHeaderCodec, body, id.Keys.ObjSk, "manifest")
	if err != nil {
		return fields, err
	}
	fields.Header = header
	fields.ExpectedHead = head
	if fields.Entries == nil {
		fields.Entries = []b.Signed[c.Entry]{}
	}
	return fields, nil
}

func SignEntry(cxt *Context, h History, kind int, payload any) (b.Signed[c.Entry], error) {
	return crypto.SignObject(c.EntryCodec, c.Entry{VaultId: cxt.VaultID, Seq: h.State.Seq + 1, Parent: h.State.Head, EntryPayload: c.EntryPayload{Kind: kind, Payload: payload}, Signer: cxt.Identity.Record.Id}, cxt.Identity.Keys.ObjSk, "entry")
}
