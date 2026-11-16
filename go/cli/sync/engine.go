package sync

import (
	"context"
	"os"

	"github.com/notsuhas/envden/go/cli/admin/move"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/notice"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/local/reconcile"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/cli/sync/remote/attempt"
	upload "github.com/notsuhas/envden/go/cli/sync/remote/push"
	"github.com/notsuhas/envden/go/cli/vault"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

type Options = syncmodel.Options

type Result struct {
	Kind      string   `json:"kind"`
	Changed   int      `json:"changed"`
	Conflicts int      `json:"conflicts"`
	Reports   []string `json:"reports"`
}

func Push(ctx context.Context, a contracts.Adapters, options Options) (Result, error) {
	return countedSync(ctx, a, options, true)
}

func Pull(ctx context.Context, a contracts.Adapters, options Options) (Result, error) {
	return countedSync(ctx, a, options, false)
}

func countedSync(ctx context.Context, a contracts.Adapters, options Options, pushing bool) (Result, error) {
	reports := []string{}
	report := options.Report
	options.Report = func(message string) {
		reports = append(reports, message)

		if report != nil {
			report(message)
		}
	}
	result, err := runSync(ctx, a, options, pushing, nil)
	if err == nil {
		output.SetCommandCounts(ctx, &result.Changed, &result.Conflicts)
	}

	result.Reports = reports

	return result, err
}

func runSync(ctx context.Context, a contracts.Adapters, options Options, pushing bool, choose func(string) (string, error)) (Result, error) {
	if pushing && (options.Interactive == nil || !*options.Interactive) && !options.Yes {
		return Result{}, envdenerrors.New(envdenerrors.InvalidInput, "Without a terminal, push needs --yes to confirm the changes")
	}

	var result Result
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		context, err := remote.SyncContext(ctx, a, options, linkAPI(ctx, a))
		if err != nil {
			return err
		}

		history, err := vault.ReadHistory(ctx, context.Client, context.VaultID, context.State)
		if err != nil {
			return err
		}

		followed, err := move.FollowServerMove(ctx, &shared.Context{Adapters: a, Local: context.State, Identity: context.Identity, VaultID: context.VaultID, Client: context.Client, Now: options.Now}, history, options.Fetcher, options.Unlock)
		if err != nil {
			return err
		}

		if followed.Kind == "moved" {
			context.Client = followed.Client
			history, err = vault.ReadHistory(ctx, context.Client, context.VaultID, context.State)
			if err != nil {
				return err
			}
		}

		cwd := options.Cwd

		if cwd == "" {
			cwd, _ = os.Getwd()
		}

		report := options.Report

		if report == nil {
			report = func(string) {}
		}
		if err = checkout.AdoptWorktreeAt(a, context.State, cwd, report); err != nil {
			return err
		}

		repos, err := reconcile.SelectedRepos(a, context.State, options, context.Links, context.SkippedRoots)
		if err != nil {
			return err
		}

		for index := 0; index < 3; index++ {
			if index > 0 {
				history, err = vault.ReadHistory(ctx, context.Client, context.VaultID, context.State)
				if err != nil {
					return err
				}
			}

			accepted, err := remote.AcceptHead(context, &history, false)
			if err != nil {
				return err
			}

			for _, entry := range accepted.Repairs {
				name, err := remote.EntryName(context, entry)
				if err != nil {
					return err
				}

				kind := "restored"

				if entry.State == 4 {
					kind = "lost"
				}

				context.Report("Repair changed file " + name.Path + ": " + kind)
			}
			if err = remote.PersistCheckpoint(context); err != nil {
				return err
			}
			if err = attempt.AcknowledgeAttempt(context); err != nil {
				return err
			}

			placed, err := reconcile.Reconcile(context, repos, accepted.NoFastForward, choose)
			if err != nil {
				return err
			}
			if err = remote.PersistCheckpoint(context); err != nil {
				return err
			}

			result = Result{Kind: "pulled", Changed: placed.Changed, Conflicts: placed.Conflicts}

			if pushing {
				records, err := local.ConflictRecords(a.Home)
				if err != nil {
					return err
				}

				result.Conflicts = max(result.Conflicts, len(records))
				count, err := upload.UploadChanges(context, repos, placed.FailedStores)

				if envdenerrors.Is(err, envdenerrors.HeadMoved) {
					continue
				}
				if err != nil {
					return err
				}

				result.Changed = count
				result.Kind = "pushed"

				if result.Conflicts > 0 {
					result.Kind = "conflict"
				}
				if err = remote.PersistCheckpoint(context); err != nil {
					return err
				}
			}
			if err = local.PruneBackups(a.Home, options.Now()); err != nil {
				return err
			}

			if a.PrunePlacementBackups != nil {
				if err = a.PrunePlacementBackups(options.Now()); err != nil {
					return err
				}
			}
			if err = notice.SettleRemoteNotice(context); err == nil {
				err = notice.RefreshNotice(ctx, a.Home, context.State, func(root string) (bool, error) { return a.Repo.CaseInsensitive(root, true) }, a.Now, a.Timing)
			}
			if err != nil {
				context.Report("Notice refresh failed; sync completed")
			}

			return nil
		}

		return envdenerrors.New(envdenerrors.HeadMoved, "Another device kept changing files during sync. Run the command again")
	})

	return result, err
}
