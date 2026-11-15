package attempt

import (
	"encoding/json"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/store"
	"github.com/notsuhas/envden/go/cli/sync/local"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/adapters"
)

func BlockedStores(context *sm.Context, failed map[string]bool) (map[string]bool, error) {
	blocked := map[string]bool{}
	for key := range failed {
		blocked[key] = true
	}
	records, err := local.ConflictRecords(context.Adapters.Home)
	if err != nil {
		return nil, err
	}
	for _, record := range records {
		blocked[record.Store] = true
	}
	config, err := settings.ReadConfig(context.Adapters.Home)
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
	for _, link := range context.State.Links {
		if !adapters.AcceptsEnvPath(link.Path, rules) {
			blocked[link.Store] = true
		}
	}
	applied, err := local.AppliedFiles(context.Adapters.Home)
	if err != nil {
		return nil, err
	}
	entries, err := remote.ReadableEntries(context)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if local.HasAppliedEntry(entry, applied) {
			continue
		}
		name, err := remote.EntryName(context, entry)
		if err != nil {
			return nil, err
		}
		path, err := store.StorePath(context.Adapters.Home, name.RepoId, name.Path)
		if err != nil {
			return nil, err
		}
		blocked[path] = true
	}

	return blocked, nil
}
