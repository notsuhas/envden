package repair

import (
	"context"
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/time"
	"github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func FixLost(ctx context.Context, c *shared.Context, h shared.History, current manifests.Files, lost []manifests.FileEntry, available map[string]bool, repairID []byte) error {
	material, err := shared.CurrentMaterial(ctx, c, h)
	if err != nil {
		return err
	}

	older := []repair.History{}
	for _, h := range h.Headers {
		raw, e := shared.OptionalObject(ctx, c.Client, "/v1/files/"+client.Text(h.Body.FilesHash))
		if e != nil {
			return e
		}

		if raw != nil && !encoding.Equal(crypto.H("files", raw), h.Body.FilesHash) {
			return errors.New(errors.InvalidData, "File list hash mismatch")
		}

		item := repair.History{Header: h.Body}
		if raw != nil {
			f, e := encoding.Decode(manifests.FilesCodec, raw)
			if e != nil {
				return e
			}

			item.Files = &f
		}

		older = append(older, item)
	}

	losses := map[string]bool{}
	for _, e := range lost {
		losses[client.Text(e.FileId)] = true
	}

	entries := []manifests.FileEntry{}
	report := []string{}
	for _, file := range current.Entries {
		if !losses[client.Text(file.FileId)] {
			entries = append(entries, file)
			continue
		}

		fc := protocolfiles.FileContext{VaultId: c.VaultID, Epoch: file.Epoch, FileId: file.FileId, Version: file.Version}
		name, e := protocolfiles.OpenFileName(file.Name, material.Keys[file.Epoch], material.Ring.IdKey, fc)
		if e != nil {
			return e
		}

		next := fc
		next.Epoch = material.Ring.Epoch
		next.Version++
		candidate, e := repair.ChooseRecoveryCandidate(repair.CandidateInput{FileId: file.FileId, BeforeVersion: file.Version, History: older, AvailableBlobs: available})
		if e != nil {
			return e
		}

		hash := make([]byte, 32)
		state := 4
		if candidate.Kind == "recovered" {
			entry := candidate.Entry
			box, e := shared.OptionalObject(ctx, c.Client, "/v1/blobs/"+client.Text(entry.BlobHash))
			if e != nil {
				return e
			}

			if box != nil {
				old := fc
				old.Epoch = entry.Epoch
				old.Version = entry.Version
				content, e := protocolfiles.OpenFile(box, material.Keys[entry.Epoch], material.Ring.IdKey, old, entry.BlobHash, name)
				if e != nil {
					return e
				}

				blob, e := protocolfiles.SealFile(content, material.Key, next)
				if e != nil {
					return e
				}

				hash = crypto.H("blob", blob)
				if e = shared.Send(ctx, c.Client, "/v1/blobs/"+client.Text(hash), "PUT", blob); e != nil {
					return e
				}

				state = 3
			}
		}

		message := "lost; no verified older copy"
		if state == 3 && candidate.Kind == "recovered" {
			when, e := time.WhenText(int64(candidate.Header.CreatedAt), c.Now(), "") //nolint:gosec // The signed timestamp conversion preserves existing date formatting for all wire values.
			if e != nil {
				return e
			}

			message = "recovered from " + when
		}

		report = append(report, name.RepoId+"/"+name.Path+": "+message)
		sealed, e := protocolfiles.SealFileName(name, material.Key, next)
		if e != nil {
			return e
		}

		file.Epoch = next.Epoch
		file.Version = next.Version
		file.State = state
		file.BlobHash = hash
		file.Name = sealed
		entries = append(entries, file)
	}

	swap, err := shared.AdminSwap(h, c.Identity, 11, c.Now(), manifests.Swap{Files: &manifests.Files{Entries: entries}})
	if err != nil {
		return err
	}

	if err = files.AtomicWrite(filepath.Join(c.Adapters.Home, "state", "repair-report-"+client.Text(repairID)), []byte(strings.Join(report, "\n")), c.Now); err != nil {
		return err
	}

	_, err = shared.SubmitAdmin(ctx, c, swap)

	return err
}
