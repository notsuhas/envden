package shared

import (
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func AdminSwap(h History, id identity.Identity, op int, now int64, fields manifests.Swap) (manifests.Swap, error) {
	before := h.Headers[len(h.Headers)-1]
	head := HeaderHash(before)
	body := before.Body
	body.Seq++
	body.Prev = head
	body.Op = op
	body.CreatedAt = uint64(now) //nolint:gosec // Unix millisecond clock values are nonnegative.
	body.Signer = id.Record.Id
	if len(fields.Entries) > 0 {
		last := fields.Entries[len(fields.Entries)-1]
		body.ListSeq = last.Body.Seq
		body.ListHead = EntryHash(last)
		switch payload := last.Body.Payload.(type) {
		case entrypayloads.RemoveDevice:
			body.Epoch = payload.Change.Epoch
		case entrypayloads.NewEpoch:
			body.Epoch = payload.Change.Epoch
		case entrypayloads.ReplaceRecovery:
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
		raw, err := encoding.Encode(manifests.FilesCodec, *fields.Files)
		if err != nil {
			return fields, err
		}

		body.FilesHash = crypto.H("files", raw)
	}

	header, err := crypto.SignObject(manifests.ManifestHeaderCodec, body, id.Keys.ObjSk, "manifest")
	if err != nil {
		return fields, err
	}

	fields.Header = header
	fields.ExpectedHead = head
	if fields.Entries == nil {
		fields.Entries = []encoding.Signed[codecs.Entry]{}
	}

	return fields, nil
}

func SignEntry(cxt *Context, h History, kind int, payload any) (encoding.Signed[codecs.Entry], error) {
	return crypto.SignObject(codecs.EntryCodec, codecs.Entry{VaultId: cxt.VaultID, Seq: h.State.Seq + 1, Parent: h.State.Head, EntryPayload: codecs.EntryPayload{Kind: kind, Payload: payload}, Signer: cxt.Identity.Record.Id}, cxt.Identity.Keys.ObjSk, "entry")
}
