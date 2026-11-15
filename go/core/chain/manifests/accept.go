package manifests

import (
	"errors"

	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
)

type AcceptInput struct {
	Checkpoint    Checkpoint
	Head          encoding.Signed[manifests.ManifestHeader]
	StoredHeaders []encoding.Signed[manifests.ManifestHeader]
	Source        Source
	LocalFileIds  map[string]bool
}

type Result struct {
	Kind          string
	Checkpoint    *Checkpoint
	Headers       []encoding.Signed[manifests.ManifestHeader]
	Repairs       []manifests.FileEntry
	NoFastForward map[string]bool
}

func AcceptManifest(input AcceptInput) (Result, error) {
	tryResult, err := chainshared.TryResult(func() (Result, error) {
		return accept(input)
	})
	result := tryResult

	x := &SourceFailure{}
	if errors.As(err, &x) {
		return Result{}, x.Failure.Cause
	}
	if chainshared.Invalid(err) {
		return Result{Kind: "invalid"}, nil
	}

	return result, err
}

func accept(input AcceptInput) (Result, error) {
	c, head := input.Checkpoint, input.Head
	source := ProtectSource(input.Source)
	storedBySeq := IndexHeaders(input.StoredHeaders)
	if head.Body.Seq <= c.Header.Body.Seq {
		stored, ok := storedBySeq[head.Body.Seq]
		forkedHead := !ok
		if !forkedHead {
			headerHashResult, err := headerHash(stored)
			if err != nil {
				return *new(Result), err
			}
			headerHashResult2, err := headerHash(head)
			if err != nil {
				return *new(Result), err
			}
			forkedHead = !encoding.Equal(headerHashResult, headerHashResult2)
		}
		if forkedHead {
			if err := CheckHeaderSignature(source, c.State, head); err != nil {
				return *new(Result), err
			}

			return Result{Kind: "fork"}, nil
		}
		if head.Body.Seq == c.Header.Body.Seq {
			return Result{Kind: "unchanged"}, nil
		}

		return Result{Kind: "rollback"}, nil
	}
	headers, err := HeaderDescent(source, c.Header, head, func(h encoding.Signed[manifests.ManifestHeader]) error {
		return CheckHeaderSignature(source, c.State, h)
	})
	if err != nil {
		return *new(Result), err
	}
	if headers == nil {
		return Result{Kind: "fork"}, nil
	}
	state := c.State
	previous := c.Header
	known := map[string]bool{}
	for _, h := range input.StoredHeaders {
		hash, err := headerHash(h)
		if err != nil {
			return Result{}, err
		}
		known[chainshared.ID(hash)] = true
	}
	hash, err := headerHash(c.Header)
	if err != nil {
		return Result{}, err
	}
	known[chainshared.ID(hash)] = true
	repairs := []manifests.FileEntry{}
	noFastForward := map[string]bool{}
	_, err = CheckedFiles(&c.Files, c.Header.Body.FilesHash)
	if err != nil {
		return *new(Result), err
	}

	for _, signed := range headers {
		h := signed.Body
		if err := chainshared.Check(encoding.Equal(h.VaultId, state.VaultId)); err != nil {
			return *new(Result), err
		}

		stored, ok := storedBySeq[h.Seq]
		divergedHeader := ok
		if divergedHeader {
			headerHashResult3, err := headerHash(stored)
			if err != nil {
				return *new(Result), err
			}
			headerHashResult4, err := headerHash(signed)
			if err != nil {
				return *new(Result), err
			}
			divergedHeader = !encoding.Equal(headerHashResult3, headerHashResult4)
		}
		if divergedHeader {
			if err := CheckHeaderSignature(source, state, signed); err != nil {
				return *new(Result), err
			}

			return Result{Kind: "fork"}, nil
		}
		advanceHeaderResult, err := advanceHeader(source, state, previous, signed, known)
		if err != nil {
			return *new(Result), err
		}

		state = advanceHeaderResult
		changes, err := repairChanges(c, previous, signed, source)
		if err != nil {
			return *new(Result), err
		}

		repairs = append(repairs, changes...)
		for _, entry := range changes {
			if input.LocalFileIds[chainshared.ID(entry.FileId)] {
				noFastForward[chainshared.ID(entry.FileId)] = true
			}
		}
		hash, err := headerHash(signed)
		if err != nil {
			return Result{}, err
		}
		known[chainshared.ID(hash)] = true
		previous = signed
	}
	filesResult, err := source.Files(head.Body.FilesHash)
	if err != nil {
		return *new(Result), err
	}
	files, err := CheckedFiles(filesResult, head.Body.FilesHash)
	if err != nil {
		return *new(Result), err
	}

	_, err = ChangedFiles(c.Files, files, c.Header.Body.Epoch, head.Body.Epoch)
	if err != nil {
		return *new(Result), err
	}
	if head.Body.Epoch != c.Header.Body.Epoch {
		box, err := source.Keyring(head.Body.KeyringHash)
		if err != nil {
			return *new(Result), err
		}

		key, err := source.EpochKey(head.Body.Epoch)
		if err != nil {
			return *new(Result), err
		}
		if err := chainshared.Check(box != nil && key != nil && encoding.Equal(crypto.H("keyring-blob", box), head.Body.KeyringHash)); err != nil {
			return *new(Result), err
		}
		_, err = keyring.OpenKeyring(box, key, state.VaultId, state.Epoch, state.Commits, c.IdKey)
		if err != nil {
			return *new(Result), err
		}
	}

	return Result{Kind: "accepted", Checkpoint: &Checkpoint{Header: head, Files: files, State: state, IdKey: c.IdKey}, Headers: headers, Repairs: repairs, NoFastForward: noFastForward}, nil
}
