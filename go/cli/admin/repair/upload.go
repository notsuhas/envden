package repair

import (
	"context"
	"path/filepath"
	"sort"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	historyfiles "github.com/notsuhas/envden/go/cli/history/files"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
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

		headers := []encoding.Signed[manifests.ManifestHeader]{}
		for _, v := range c.Local.Headers {
			raw, e := client.Binary(v)
			if e != nil {
				return e
			}

			h, e := encoding.Decode(encoding.SignedCodec(manifests.ManifestHeaderCodec), raw)
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
		saved, err := statefiles.OptionalRead(evidence)
		if err != nil {
			return err
		}

		if saved == nil {
			if err = statefiles.AtomicWrite(evidence, []byte(client.Text(shared.HeaderHash(remoteHead))), a.Now); err != nil {
				return err
			}
		}

		if localHead.Body.Seq > remoteHead.Body.Seq {
			floor := *c.Local
			floor.Headers = []string{}
			for _, h := range remote.Headers {
				raw, e := encoding.Encode(encoding.SignedCodec(manifests.ManifestHeaderCodec), h)
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

		files := manifests.Files{Entries: []manifests.FileEntry{}}
		if c.Local.Files != "" {
			raw, e := client.Binary(c.Local.Files)
			if e != nil {
				return e
			}

			files, e = encoding.Decode(manifests.FilesCodec, raw)
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

					if encoding.Equal(crypto.H("files", raw), hash) {
						return raw, nil
					}
				}

				return historyfiles.ReadBytes(filepath.Join(a.Home, "state", "file-lists", client.Text(hash)))
			}, remoteHead.Body.Seq)
			if e != nil {
				return e
			}

			raw, e := encoding.Encode(encoding.List(manifests.SwapCodec), swaps)
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

		envelope, err := historyfiles.ReadBytes(filepath.Join(a.Home, "state", "envelope.bin"))
		if err != nil {
			return err
		}

		repaired, err := shared.ReadHistory(ctx, c.Client, c.VaultID)
		if err != nil {
			return err
		}

		if envelope != nil && encoding.Equal(crypto.H("envelope-blob", envelope), repaired.Headers[len(repaired.Headers)-1].Body.EnvelopeHash) {
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

		sort.Slice(blobs, func(i, j int) bool { return encoding.Compare(blobs[i], blobs[j]) < 0 })
		report, err := crypto.SignObject(serverprotocol.RepairReportCodec, serverprotocol.RepairReport{VaultId: c.VaultID, RepairId: c.RepairID, Head: head, Blobs: blobs, Signer: c.Identity.Record.Id}, c.Identity.Keys.ObjSk, "repair-report")
		if err != nil {
			return err
		}

		raw, err := encoding.Encode(encoding.SignedCodec(serverprotocol.RepairReportCodec), report)
		if err != nil {
			return err
		}

		return shared.Send(ctx, c.Client, "/v1/repair/report", "PUT", raw)
	})

	return result, err
}
