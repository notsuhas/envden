package initial

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	content "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	files "github.com/notsuhas/envden/go/core/protocol/files"
	"os"
	"sort"
)

func PushInitialFiles(ctx context.Context, a contracts.Adapters, state *model.State, resume func(context.Context) error, report func(string)) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		_, err := client.RetryHead(func() (bool, error) { return true, push(ctx, a, state, resume, report) })
		return err
	})
}

func push(ctx context.Context, a contracts.Adapters, state *model.State, resume func(context.Context) error, report func(string)) error {
	if len(state.Links) == 0 {
		return nil
	}
	if state.Server == nil || state.VaultID == "" {
		return errors.New(errors.NotFound, "Vault is not configured")
	}
	connection, err := vault.VaultConnection(ctx, a, state, nil)
	if err != nil {
		return err
	}
	history, err := vault.ReadHistory(ctx, connection.Client, connection.VaultID, nil)
	if err != nil {
		return err
	}
	previous := history.Headers[len(history.Headers)-1]
	if previous.Body.Seq != 1 {
		if resume != nil {
			return resume(ctx)
		}
		return ResumeInitialFiles(ctx, a)
	}
	key, err := a.Keychain.Get("envden/"+a.Home+"/epoch/1", false)
	if err != nil {
		return err
	}
	idKey, err := a.Keychain.Get("envden/"+a.Home+"/id-key", false)
	if err != nil {
		return err
	}
	if key == nil || idKey == nil {
		return errors.New(errors.Locked, "Vault keys unavailable")
	}
	list := m.Files{Entries: []m.FileEntry{}}
	bases := map[string][]byte{}
	for _, link := range state.Links {
		if link.LocalOnly {
			continue
		}
		var checkout *model.Checkout
		for _, v := range state.Approved {
			if v.Root == link.Root {
				checkout = &v
				break
			}
		}
		if checkout == nil {
			return errors.New(errors.Unauthorized, "Checkout approval required")
		}
		repoID := checkout.RepoID
		if alias, ok := state.Aliases.Get(repoID).(string); ok {
			repoID = alias
		}
		id, err := files.FileID(idKey, repoID, link.Path)
		if err != nil {
			return err
		}
		data, err := os.ReadFile(link.Store)
		if err != nil {
			return err
		}
		if len(data) > 1048576 {
			if report != nil {
				report("Skipped oversized env file: " + link.Path + " exceeds 1 MiB")
			}
			continue
		}
		bases[basePath(a.Home, link)] = data
		exists := false
		for _, v := range list.Entries {
			if b.Equal(v.FileId, id) {
				exists = true
				break
			}
		}
		if exists {
			continue
		}
		context := files.FileContext{VaultId: connection.VaultID, Epoch: 1, FileId: id, Version: 1}
		name := content.FileName{RepoId: repoID, Path: link.Path}
		blob, err := files.SealFile(content.File{RepoId: repoID, Path: link.Path, Content: data}, key, context)
		if err != nil {
			return err
		}
		hash := c.H("blob", blob)
		response, err := connection.Client.Request(ctx, "/v1/blobs/"+client.Text(hash), "PUT", blob)
		if err != nil {
			return err
		}
		response.Body.Close()
		boxed, err := files.SealFileName(name, key, context)
		if err != nil {
			return err
		}
		list.Entries = append(list.Entries, m.FileEntry{FileId: id, Version: 1, Epoch: 1, State: 1, BlobHash: hash, Name: boxed})
	}
	if len(list.Entries) == 0 {
		return nil
	}
	sort.Slice(list.Entries, func(i, j int) bool { return b.Compare(list.Entries[i].FileId, list.Entries[j].FileId) < 0 })
	hash, err := c.ObjectHash(m.ManifestHeaderCodec, previous, "manifest")
	if err != nil {
		return err
	}
	body := previous.Body
	body.Seq = 2
	body.Prev = hash
	body.Op = 1
	body.FilesHash = c.H("files", m.FilesCodec.Write(list))
	body.CreatedAt = uint64(a.Now())
	header, err := c.SignObject(m.ManifestHeaderCodec, body, connection.Identity.Keys.ObjSk, "manifest")
	if err != nil {
		return err
	}
	swap := m.Swap{ExpectedHead: hash, Header: header, Entries: []b.Signed[p.Entry]{}, Files: &list}
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		return err
	}
	response, err := connection.Client.Request(ctx, "/v1/swap", "POST", raw)
	if err != nil {
		return err
	}
	response.Body.Close()
	state.Headers = append(state.Headers, client.Text(p.SignedCodec(m.ManifestHeaderCodec).Write(header)))
	state.Files = client.Text(m.FilesCodec.Write(list))
	state.Checkpoint = client.Text(b.Must(c.ObjectHash(m.ManifestHeaderCodec, header, "manifest")))
	if err = store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
		return err
	}
	return recordPushed(a.Home, list, bases, a.Now)
}
