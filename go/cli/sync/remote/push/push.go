package push

import (
	"sort"

	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote/attempt"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func UploadChanges(context *syncmodel.Context, repos, failed map[string]bool) (int, error) {
	files := manifests.Files{Entries: append([]manifests.FileEntry{}, context.Checkpoint.Files.Entries...)}
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

	sort.Slice(files.Entries, func(i, j int) bool { return encoding.Compare(files.Entries[i].FileId, files.Entries[j].FileId) < 0 })
	previous := context.Checkpoint.Header
	expected, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, previous, "manifest")
	if err != nil {
		return 0, err
	}

	body := previous.Body
	body.Seq++
	body.Prev = expected
	body.Signer = context.Identity.Record.Id
	body.Op = 1
	body.FilesHash = crypto.H("files", manifests.FilesCodec.Write(files))
	body.CreatedAt = uint64(context.Options.Now()) //nolint:gosec // Unix millisecond clock values are nonnegative.
	header, err := crypto.SignObject(manifests.ManifestHeaderCodec, body, context.Identity.Keys.ObjSk, "manifest")
	if err != nil {
		return 0, err
	}

	swap := manifests.Swap{ExpectedHead: expected, Header: header, Files: &files, Entries: []encoding.Signed[codecs.Entry]{}}
	entries := []manifests.FileEntry{}

	for _, entry := range files.Entries {
		if _, ok := seen[encoding.Base32(entry.FileId)]; ok {
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

		if _, ok := changed[localfiles.BasePath(context.Adapters.Home, link.Store, root)]; ok {
			base := localfiles.BasePath(context.Adapters.Home, link.Store)

			if !has[base] {
				places = append(places, base)
				has[base] = true
			}
		}
	}
	if err = attempt.SaveAttempt(context, entries, header, places); err != nil {
		return 0, err
	}

	raw, err := encoding.Encode(manifests.SwapCodec, swap)
	if err != nil {
		return 0, err
	}

	response, err := context.Client.Request(context.Context, "/v1/swap", "POST", raw)
	if err != nil {
		return 0, err
	}

	_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
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

		change, ok := changed[localfiles.BasePath(context.Adapters.Home, link.Store, root)]

		if link.LocalOnly || !ok || change.Bytes != nil {
			kept = append(kept, link)
		}
	}

	context.State.Links = kept

	return len(changed), nil
}
