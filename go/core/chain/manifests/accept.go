package manifests

import (
	d "github.com/notsuhas/envden/go/core/chain/devices"
	s "github.com/notsuhas/envden/go/core/chain/shared"
	o "github.com/notsuhas/envden/go/core/chain/swaps/operation"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
)

type AcceptInput struct {
	Checkpoint    Checkpoint
	Head          b.Signed[m.ManifestHeader]
	StoredHeaders []b.Signed[m.ManifestHeader]
	Source        Source
	LocalFileIds  map[string]bool
}

type Result struct {
	Kind          string
	Checkpoint    *Checkpoint
	Headers       []b.Signed[m.ManifestHeader]
	Repairs       []m.FileEntry
	NoFastForward map[string]bool
}

func AcceptManifest(input AcceptInput) (Result, error) {
	result, err := s.Try(func() Result { return accept(input) })
	if x, ok := err.(*SourceFailure); ok {
		return Result{}, x.Failure.Cause
	}
	if s.Invalid(err) {
		return Result{Kind: "invalid"}, nil
	}

	return result, err
}

func accept(input AcceptInput) Result {
	c, head := input.Checkpoint, input.Head
	source := ProtectSource(input.Source)
	storedBySeq := IndexHeaders(input.StoredHeaders)
	if head.Body.Seq <= c.Header.Body.Seq {
		stored, ok := storedBySeq[head.Body.Seq]
		if !ok || !b.Equal(headerHash(stored), headerHash(head)) {
			b.Must(true, CheckHeaderSignature(source, c.State, head))
			return Result{Kind: "fork"}
		}
		if head.Body.Seq == c.Header.Body.Seq {
			return Result{Kind: "unchanged"}
		}
		return Result{Kind: "rollback"}
	}
	headers := b.Must(HeaderDescent(source, c.Header, head, func(h b.Signed[m.ManifestHeader]) error { return CheckHeaderSignature(source, c.State, h) }))
	if headers == nil {
		return Result{Kind: "fork"}
	}
	state := c.State
	previous := c.Header
	known := map[string]bool{}
	for _, h := range input.StoredHeaders {
		known[s.ID(headerHash(h))] = true
	}
	known[s.ID(headerHash(c.Header))] = true
	repairs := []m.FileEntry{}
	noFastForward := map[string]bool{}
	b.Must(CheckedFiles(&c.Files, c.Header.Body.FilesHash))
	for _, signed := range headers {
		h := signed.Body
		s.Check(b.Equal(h.VaultId, state.VaultId))
		if stored, ok := storedBySeq[h.Seq]; ok && !b.Equal(headerHash(stored), headerHash(signed)) {
			b.Must(true, CheckHeaderSignature(source, state, signed))
			return Result{Kind: "fork"}
		}
		state = advanceHeader(source, state, previous, signed, known)
		changes := repairChanges(c, previous, signed, source)
		repairs = append(repairs, changes...)
		for _, entry := range changes {
			if input.LocalFileIds[s.ID(entry.FileId)] {
				noFastForward[s.ID(entry.FileId)] = true
			}
		}
		known[s.ID(headerHash(signed))] = true
		previous = signed
	}
	files := b.Must(CheckedFiles(b.Must(source.Files(head.Body.FilesHash)), head.Body.FilesHash))
	b.Must(ChangedFiles(c.Files, files, c.Header.Body.Epoch, head.Body.Epoch))
	if head.Body.Epoch != c.Header.Body.Epoch {
		box := b.Must(source.Keyring(head.Body.KeyringHash))
		key := b.Must(source.EpochKey(head.Body.Epoch))
		s.Check(box != nil && key != nil && b.Equal(cr.H("keyring-blob", box), head.Body.KeyringHash))
		b.Must(keyring.OpenKeyring(box, key, state.VaultId, state.Epoch, state.Commits, c.IdKey))
	}

	return Result{Kind: "accepted", Checkpoint: &Checkpoint{Header: head, Files: files, State: state, IdKey: c.IdKey}, Headers: headers, Repairs: repairs, NoFastForward: noFastForward}
}

func advanceHeader(source Source, state *d.State, previous, signed b.Signed[m.ManifestHeader], known map[string]bool) *d.State {
	h := signed.Body
	entries := b.Must(EntryDescent(source, state, h))
	before := state
	state = applyEntries(state, entries)
	signer, ok := state.Devices[s.ID(h.Signer)]
	s.Check(ok && b.Must(cr.VerifyObject(m.ManifestHeaderCodec, signed, signer.ObjPub, "manifest")).OK)
	b.Must(o.OperationRequirement(previous.Body, h, entries, before))
	s.Check(h.Epoch == state.Epoch)
	for _, entry := range entries {
		if entry.Body.Kind == 6 {
			s.Check(known[s.ID(entry.Body.Payload.(p.RepairDone).RestoredHead)])
		}
	}

	return state
}

func repairChanges(c Checkpoint, previous, signed b.Signed[m.ManifestHeader], source Source) []m.FileEntry {
	h := signed.Body
	if h.Op == 1 || h.Op == 11 {
		var old *m.Files
		if b.Equal(previous.Body.FilesHash, c.Header.Body.FilesHash) {
			old = &c.Files
		} else {
			old = b.Must(source.Files(previous.Body.FilesHash))
		}
		next := b.Must(source.Files(h.FilesHash))
		if h.Op == 11 || (old != nil && next != nil) {
			changes := b.Must(ChangedFiles(b.Must(CheckedFiles(old, previous.Body.FilesHash)), b.Must(CheckedFiles(next, h.FilesHash)), previous.Body.Epoch, h.Epoch, h.Op))
			if h.Op == 11 {
				return changes
			}
		}
	}

	return nil
}
