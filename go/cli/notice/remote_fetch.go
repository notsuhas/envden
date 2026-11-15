package notice

import (
	"context"
	"encoding/json"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/sync/local"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RemoteFile struct{ RepoID, Path string }

type RemoteResult struct {
	Remote
	Files []RemoteFile
}

func RemoteNotice(ctx context.Context, a contracts.Adapters, options syncmodel.Options) (RemoteResult, error) {
	syncContext, e := remote.SyncContext(ctx, a, options, syncmodel.Links{})
	if e != nil {
		return RemoteResult{}, e
	}

	if _, e = remote.AcceptHead(syncContext, nil, true); e != nil {
		return RemoteResult{}, e
	}

	result, e := PendingRepos(syncContext)
	if e != nil {
		return result, e
	}

	e = lock.WithStateLock(ctx, a.Home, a.Timing, func(context.Context) error {
		if e := WriteRemoteNotice(a.Home, result.Remote, a.Now); e != nil {
			return e
		}

		entries := []string{}
		for _, entry := range syncContext.Entries {
			entries = append(entries, client.Text(encoding.SignedCodec(codecs.EntryCodec).Write(entry)))
		}

		return AddPendingJoins(a.Home, entries, syncContext.Identity.Record.Id, a.Now)
	})

	return result, e
}

func SettleRemoteNotice(sc *syncmodel.Context) error {
	result, e := PendingRepos(sc)
	if e != nil {
		return e
	}

	return lock.WithStateLock(sc.Context, sc.Adapters.Home, sc.Adapters.Timing, func(ctx context.Context) error {
		return WriteRemoteNotice(sc.Adapters.Home, result.Remote, sc.Options.Now)
	})
}

func PendingRepos(context *syncmodel.Context) (RemoteResult, error) {
	result := RemoteResult{Remote: Remote{CheckedAt: context.Options.Now(), Repos: []string{}}, Files: []RemoteFile{}}
	applied, e := local.AppliedFiles(context.Adapters.Home)
	if e != nil {
		return result, e
	}

	config, e := settings.ReadConfig(context.Adapters.Home)
	if e != nil {
		return result, e
	}

	rules := adapters.EnvFileRules{}
	if config.EnvFiles != nil {
		raw, _ := jsonvalue.Marshal(config.EnvFiles)
		_ = json.Unmarshal(raw, &rules)
	}

	approved := map[string]bool{}
	for _, c := range context.State.Approved {
		approved[syncmodel.Alias(context.State, c.RepoID)] = true
	}

	entries, e := remote.ReadableEntries(context)
	if e != nil {
		return result, e
	}

	for _, entry := range entries {
		if local.HasAppliedEntry(entry, applied) {
			continue
		}

		name, e := remote.EntryName(context, entry)
		if e != nil {
			return result, e
		}

		if approved[name.RepoId] && adapters.AcceptsEnvPath(name.Path, rules) && local.ReceivesFile(context.State, name.RepoId, name.Path) {
			result.Files = append(result.Files, RemoteFile{name.RepoId, name.Path})
			result.Repos = appendUnique(result.Repos, name.RepoId)
		}
	}

	return result, nil
}
