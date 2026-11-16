package reconcile

import (
	"encoding/json"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/store"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation"
	"github.com/notsuhas/envden/go/cli/sync/local/validation"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/adapters"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Result struct {
	Changed, Conflicts int
	FailedStores       map[string]bool
}

func Rules(home string) (adapters.EnvFileRules, error) {
	config, err := settings.ReadConfig(home)
	if err != nil {
		return adapters.EnvFileRules{}, err
	}

	if config.EnvFiles == nil {
		return adapters.EnvFileRules{}, nil
	}

	raw, err := jsonvalue.Marshal(config.EnvFiles)
	if err != nil {
		return adapters.EnvFileRules{}, err
	}

	var rules adapters.EnvFileRules
	if err = json.Unmarshal(raw, &rules); err != nil {
		return adapters.EnvFileRules{}, err
	}

	return rules, nil
}

func Reconcile(context *syncmodel.Context, repos, noFastForward map[string]bool, choose func(string) (string, error)) (Result, error) {
	applied, err := local.AppliedFiles(context.Adapters.Home)
	if err != nil {
		return Result{}, err
	}

	rules, err := Rules(context.Adapters.Home)
	if err != nil {
		return Result{}, err
	}

	conflicts, failed, err := reconcileUnpublished(context, repos)
	if err != nil {
		return Result{}, err
	}

	result := Result{Conflicts: conflicts, FailedStores: failed}
	collisions, err := validation.CollisionEntries(context, repos)
	if err != nil {
		return result, err
	}

	entries, err := remote.ReadableEntries(context)
	if err != nil {
		return result, err
	}

	for _, entry := range entries {
		name, err := remote.EntryName(context, entry)
		if err != nil {
			return result, err
		}

		if !repos[name.RepoId] {
			continue
		}

		if !adapters.AcceptsEnvPath(name.Path, rules) {
			context.Report(output.SanitizeTerminal("Skipped env file: " + name.Path))
			continue
		}

		before := result.Conflicts
		path, err := store.StorePath(context.Adapters.Home, name.RepoId, name.Path)
		if err != nil {
			return result, err
		}

		if collisions[encoding.Base32(entry.FileId)] {
			failed[path] = true
			result.Conflicts++
			context.Report(output.SanitizeTerminal("Could not place env file: " + name.Path))
			continue
		}

		targets, err := reconciliation.ReconciliationTargets(context, repos, name, path)
		if err == nil && len(targets) == 0 {
			continue
		}

		var placed reconciliation.Result
		if err == nil {
			placed, err = reconciliation.ReconcileFile(context, targets, path, &entry, noFastForward, choose)
		}
		if err != nil {
			if syncmodel.IsCancelled(err) {
				return result, err
			}

			code := "UNKNOWN"

			if x, ok := envdenerrors.As(err); ok {
				code = string(x.Code)
			}

			context.Report(output.SanitizeTerminal("Could not place env file (" + code + "): " + name.Path))
			failed[path] = true
			result.Conflicts++
		} else {
			result.Changed += placed.Changed
			result.Conflicts += placed.Conflicts
		}

		if result.Conflicts == before {
			applied.Set(encoding.Base32(entry.FileId), client.Text(manifests.FileEntryCodec.Write(entry)))
		}
		if err = local.SaveAppliedFiles(context.Adapters.Home, applied, context.Options.Now, context.AtomicWrite); err != nil {
			return result, err
		}
	}

	return result, local.SaveAppliedFiles(context.Adapters.Home, applied, context.Options.Now, context.AtomicWrite)
}
