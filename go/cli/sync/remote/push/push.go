package push

import (
	"sort"

	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote/attempt"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func UploadChanges(context *sm.Context, repos, failed map[string]bool) (int, error) {
	files := m.Files{Entries: append([]m.FileEntry{}, context.Checkpoint.Files.Entries...)}
	changed := map[string]change{}
	order := []string{}
	seen := map[string][]byte{}
	blocked, err := attempt.BlockedStores(context, failed)
	if err != nil {
		return 0, err
	}
	if err = attempt.ReportBlocked(context); err != nil {
		return 0, err
	}
	for _, link := range context.State.Links {
		if !blocked[link.Store] {
			if err = uploadLink(context, repos, link, &files, changed, &order, seen); err != nil {
				return 0, err
			}
		}
	}
	if len(changed) == 0 {
		return 0, nil
	}
	sort.Slice(files.Entries, func(i, j int) bool { return b.Compare(files.Entries[i].FileId, files.Entries[j].FileId) < 0 })
	previous := context.Checkpoint.Header
	expected, err := cr.ObjectHash(m.ManifestHeaderCodec, previous, "manifest")
	if err != nil {
		return 0, err
	}
	body := previous.Body
	body.Seq++
	body.Prev = expected
	body.Signer = context.Identity.Record.Id
	body.Op = 1
	body.FilesHash = cr.H("files", m.FilesCodec.Write(files))
	body.CreatedAt = uint64(context.Options.Now())
	header, err := cr.SignObject(m.ManifestHeaderCodec, body, context.Identity.Keys.ObjSk, "manifest")
	if err != nil {
		return 0, err
	}
	swap := m.Swap{ExpectedHead: expected, Header: header, Files: &files, Entries: []b.Signed[c.Entry]{}}
	entries := []m.FileEntry{}
	for _, entry := range files.Entries {
		if _, ok := seen[b.Base32(entry.FileId)]; ok {
			entries = append(entries, entry)
		}
	}
	places := append([]string{}, order...)
	has := map[string]bool{}
	for _, v := range places {
		has[v] = true
	}
	for _, link := range context.State.Links {
		root := ""
		if link.Mode == "copy" {
			root = link.Root
		}
		if _, ok := changed[f.BasePath(context.Adapters.Home, link.Store, root)]; ok {
			base := f.BasePath(context.Adapters.Home, link.Store)
			if !has[base] {
				places = append(places, base)
				has[base] = true
			}
		}
	}
	if err = attempt.SaveAttempt(context, entries, header, places); err != nil {
		return 0, err
	}
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		return 0, err
	}
	response, err := context.Client.Request(context.Context, "/v1/swap", "POST", raw)
	if err != nil {
		return 0, err
	}
	response.Body.Close()
	context.Checkpoint.Header = header
	context.Checkpoint.Files = files
	context.Headers = append(context.Headers, header)
	if err = attempt.AcknowledgeAttempt(context); err != nil {
		return 0, err
	}
	kept := context.State.Links[:0]
	for _, link := range context.State.Links {
		root := ""
		if link.Mode == "copy" {
			root = link.Root
		}
		change, ok := changed[f.BasePath(context.Adapters.Home, link.Store, root)]
		if link.LocalOnly || !ok || change.Bytes != nil {
			kept = append(kept, link)
		}
	}
	context.State.Links = kept

	return len(changed), nil
}
