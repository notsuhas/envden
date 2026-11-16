package lineage

import (
	"bytes"
	"encoding/json"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/settings"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/records"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	"github.com/notsuhas/envden/go/cli/sync/local/validation"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	attempt "github.com/notsuhas/envden/go/cli/sync/remote/attempt/state"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

type Notice struct{ Path, Kind, Reason string }

func HeldBackFiles(a contracts.Adapters, links syncmodel.Links) ([]Notice, error) {
	state, err := store.LoadState(a.Home)
	notices := []Notice{}
	if err != nil || state == nil {
		return notices, err
	}

	invalidAttempt, err := attempt.InvalidAttemptState(a.Home)
	if err != nil {
		return nil, err
	}

	config, err := settings.ReadConfig(a.Home)
	if err != nil {
		return nil, err
	}

	var rules adapters.EnvFileRules

	if config.EnvFiles != nil {
		raw, err := jsonvalue.Marshal(config.EnvFiles)
		if err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &rules); err != nil {
			return nil, err
		}
	}

	conflicts, err := local.ConflictRecords(a.Home)
	if err != nil {
		return nil, err
	}

	applied, err := local.AppliedFiles(a.Home)
	if err != nil {
		return nil, err
	}

	key, err := a.Keychain.Get("envden/"+a.Home+"/id-key", false)
	if err != nil {
		return nil, err
	}

	entries := manifests.Files{}

	if state.Files != "" {
		raw, err := client.Binary(state.Files)
		if err != nil {
			return nil, err
		}

		entries, err = encoding.Decode(manifests.FilesCodec, raw)
		if err != nil {
			return nil, err
		}
	}

	for _, link := range state.Links {
		if link.LocalOnly {
			continue
		}

		kind := ""
		base := localfiles.BasePath(a.Home, link.Store)
		corrupt := invalidAttempt
		checks := []struct {
			path   string
			decode func(string) (any, error)
		}{
			{base + ".entry", func(v string) (any, error) { return operation.DecodeEntry(v) }},
			{base + ".pending", func(v string) (any, error) { return operation.DecodeOperation(v) }},
			{base + ".delete", func(v string) (any, error) { return operation.DecodeDeletion(v) }},
		}

		for _, check := range checks {
			invalid, err := records.InvalidSyncRecord(check.path, check.decode)
			if err != nil {
				return nil, err
			}

			corrupt = corrupt || invalid
		}

		marker, err := localfiles.ReadBytes(base + ".corrupt")
		if err != nil {
			return nil, err
		}

		corrupt = corrupt || marker != nil
		stored, err := localfiles.ReadBytes(link.Store)
		if err != nil {
			return nil, err
		}

		if corrupt {
			kind = "invalid-state"
		} else {
			approved := false

			if links.ApprovedCheckout != nil {
				checkout, err := links.ApprovedCheckout(a.Repo, state, link.Root)
				if err != nil {
					return nil, err
				}

				approved = checkout != nil
			}

			conflict := false

			for _, record := range conflicts {
				conflict = conflict || record.Store == link.Store
			}

			pending, err := localfiles.ReadBytes(base + ".pending")
			if err != nil {
				return nil, err
			}

			entry, err := knownEntry(state, key, entries.Entries, link)
			if err != nil {
				return nil, err
			}

			switch {
			case validation.FileSizeNotice(link.Path, stored) != "":
				kind = "oversized"
			case !approved:
				kind = "needs-approval"
			case !adapters.AcceptsEnvPath(link.Path, rules):
				kind = "excluded"
			case conflict:
				kind = "conflict"
			case entry == nil && link.Mode == "link" && stored == nil:
				kind = "lost"
			case pending != nil || entry != nil && !local.HasAppliedEntry(*entry, applied):
				kind = "incomplete"
			}
		}

		if kind != "" {
			notices = append(notices, Notice{filepath.Join(link.Root, link.Path), kind, HeldBackReasons[kind]})
		}
	}

	return notices, nil
}

func knownEntry(state *state.State, key []byte, entries []manifests.FileEntry, link state.Link) (*manifests.FileEntry, error) {
	if key == nil {
		return nil, nil
	}

	for _, approved := range state.Approved {
		if approved.Root != link.Root {
			continue
		}

		id, err := protocolfiles.FileID(key, syncmodel.Alias(state, approved.RepoID), link.Path)
		if err != nil {
			return nil, err
		}

		for _, entry := range entries {
			if bytes.Equal(entry.FileId, id) {
				return &entry, nil
			}
		}

		break
	}

	return nil, nil
}
