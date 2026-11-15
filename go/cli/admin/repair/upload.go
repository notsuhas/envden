package repair

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	hf "github.com/notsuhas/envden/go/cli/history/files"
	sf "github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"path/filepath"
	"sort"
)

func UploadRepair(ctx context.Context, a contracts.Adapters, token string, now func() int64, fetch client.Fetch) (*Context, error) {
	var result *Context
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		c, err := RepairContext(ctx, a, token, now, fetch)
		if err != nil {
			return err
		}
		result = c
		remote, err := shared.ReadHistory(ctx, c.Client, c.VaultID)
		if err != nil {
			return err
		}
		headers := []b.Signed[m.ManifestHeader]{}
		for _, v := range c.Local.Headers {
			raw, e := client.Binary(v)
			if e != nil {
				return e
			}
			h, e := b.Decode(b.SignedCodec(m.ManifestHeaderCodec), raw)
			if e != nil {
				return e
			}
			headers = append(headers, h)
		}
		entries, chain, err := LocalRepairChain(c.Local.Entries)
		if err != nil {
			return err
		}
		if chain.Kind != "valid" {
			return errors.New(errors.InvalidData, "Invalid stored chain")
		}
		stored := shared.History{Headers: headers, Entries: entries, State: chain.State}
		remoteHead := remote.Headers[len(remote.Headers)-1]
		localHead := headers[len(headers)-1]
		evidence := filepath.Join(a.Home, "state", "repair-restored-"+client.Text(c.RepairID))
		saved, err := sf.OptionalRead(evidence)
		if err != nil {
			return err
		}
		if saved == nil {
			if err = sf.AtomicWrite(evidence, []byte(client.Text(shared.HeaderHash(remoteHead))), a.Now); err != nil {
				return err
			}
		}
		if localHead.Body.Seq > remoteHead.Body.Seq {
			floor := *c.Local
			floor.Headers = []string{}
			for _, h := range remote.Headers {
				raw, e := b.Encode(b.SignedCodec(m.ManifestHeaderCodec), h)
				if e != nil {
					return e
				}
				floor.Headers = append(floor.Headers, client.Text(raw))
			}
			if err = shared.CheckFloor(&floor, stored); err != nil {
				return err
			}
		} else {
			if err = shared.CheckFloor(c.Local, remote); err != nil {
				return err
			}
		}
		files := m.Files{Entries: []m.FileEntry{}}
		if c.Local.Files != "" {
			raw, e := client.Binary(c.Local.Files)
			if e != nil {
				return e
			}
			files, e = b.Decode(m.FilesCodec, raw)
			if e != nil {
				return e
			}
		}
		blobs, err := uploadCachedBlobs(ctx, c, files)
		if err != nil {
			return err
		}
		if localHead.Body.Seq > remoteHead.Body.Seq {
			swaps, e := shared.HistorySwaps(stored, func(hash []byte) ([]byte, error) {
				if c.Local.Files != "" {
					raw, e := client.Binary(c.Local.Files)
					if e != nil {
						return nil, e
					}
					if b.Equal(crypto.H("files", raw), hash) {
						return raw, nil
					}
				}
				return hf.ReadBytes(filepath.Join(a.Home, "state", "file-lists", client.Text(hash)))
			}, remoteHead.Body.Seq)
			if e != nil {
				return e
			}
			raw, e := b.Encode(b.List(m.SwapCodec), swaps)
			if e != nil {
				return e
			}
			if e = shared.Send(ctx, c.Client, "/v1/repair/chain", "POST", raw); e != nil {
				return e
			}
		}
		if c.Local.Keyring != "" {
			raw, e := client.Binary(c.Local.Keyring)
			if e != nil {
				return e
			}
			if e = shared.Send(ctx, c.Client, "/v1/repair/material/keyring/"+client.Text(localHead.Body.KeyringHash), "PUT", raw); e != nil {
				return e
			}
		}
		envelope, err := hf.ReadBytes(filepath.Join(a.Home, "state", "envelope.bin"))
		if err != nil {
			return err
		}
		repaired, err := shared.ReadHistory(ctx, c.Client, c.VaultID)
		if err != nil {
			return err
		}
		if envelope != nil && b.Equal(crypto.H("envelope-blob", envelope), repaired.Headers[len(repaired.Headers)-1].Body.EnvelopeHash) {
			if err = shared.Send(ctx, c.Client, "/v1/repair/material/envelope/"+client.Text(crypto.H("envelope-blob", envelope)), "PUT", envelope); err != nil {
				return err
			}
		}
		history, err := shared.ReadHistory(ctx, c.Client, c.VaultID)
		if err != nil {
			return err
		}
		head := shared.HeaderHash(history.Headers[len(history.Headers)-1])
		if err = shared.AcceptHistory(ctx, c.Context, history); err != nil {
			return err
		}
		sort.Slice(blobs, func(i, j int) bool { return b.Compare(blobs[i], blobs[j]) < 0 })
		report, err := crypto.SignObject(s.RepairReportCodec, s.RepairReport{VaultId: c.VaultID, RepairId: c.RepairID, Head: head, Blobs: blobs, Signer: c.Identity.Record.Id}, c.Identity.Keys.ObjSk, "repair-report")
		if err != nil {
			return err
		}
		raw, err := b.Encode(b.SignedCodec(s.RepairReportCodec), report)
		if err != nil {
			return err
		}
		return shared.Send(ctx, c.Client, "/v1/repair/report", "PUT", raw)
	})
	return result, err
}

func uploadCachedBlobs(ctx context.Context, c *Context, files m.Files) ([][]byte, error) {
	blobs := [][]byte{}
	for _, f := range files.Entries {
		if f.State != 1 && f.State != 3 {
			continue
		}
		raw, err := hf.ReadBytes(filepath.Join(c.Adapters.Home, "state", "blobs", client.Text(f.BlobHash)))
		if err != nil {
			return nil, err
		}
		if raw == nil {
			continue
		}
		if !b.Equal(crypto.H("blob", raw), f.BlobHash) {
			return nil, errors.New(errors.InvalidData, "Cached blob hash mismatch")
		}
		if err = shared.Send(ctx, c.Client, "/v1/blobs/"+client.Text(f.BlobHash), "PUT", raw); err != nil {
			return nil, err
		}
		blobs = append(blobs, f.BlobHash)
	}
	return blobs, nil
}
