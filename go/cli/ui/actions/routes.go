package actions

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/contracts"
	historyfiles "github.com/notsuhas/envden/go/cli/history/files"
	historylist "github.com/notsuhas/envden/go/cli/history/list"
	"github.com/notsuhas/envden/go/cli/history/restore"
	syncdomain "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/ui/routes"
	"github.com/notsuhas/envden/go/cli/ui/routes/inputs"
	"github.com/notsuhas/envden/go/cli/ui/view/status"
	"github.com/notsuhas/envden/go/core/errors"
)

type historyView struct {
	historylist.File
	CheckedAt int64 `json:"checkedAt"`
}

func CreateDashboardActions(a contracts.Adapters, now func() int64) routes.Actions {
	return routes.Actions{
		Status: func(ctx context.Context, _ inputs.Input) (any, error) {
			return status.DashboardStatus(ctx, a, status.Sources{})
		},
		Devices: func(ctx context.Context, _ inputs.Input) (any, error) {
			return devices.ListDevices(ctx, a, now, a.Fetcher)
		},
		Pull: func(ctx context.Context, _ inputs.Input) (any, error) {
			return syncdomain.Pull(ctx, a, DashboardSyncOptions(a, now))
		},
		Push: func(ctx context.Context, _ inputs.Input) (any, error) {
			return syncdomain.Push(ctx, a, DashboardSyncOptions(a, now))
		},
		Resolve: func(ctx context.Context, input inputs.Input) (any, error) {
			return syncdomain.ResolveConflict(ctx, a, syncdomain.ResolveOptions{File: input.ID, Choice: input.Choice, Now: now})
		},
		Rename: func(ctx context.Context, input inputs.Input) (any, error) {
			kind, err := devices.RenameDevice(ctx, a, input.Name, now, a.Fetcher)
			return struct {
				Kind string `json:"kind"`
			}{kind}, err
		},
		History: func(ctx context.Context, input inputs.Input) (any, error) {
			result, err := historylist.FileHistory(ctx, a, historylist.Options{Selection: historyfiles.Selection{Cwd: input.Root, File: &input.Path}, Now: now, Fetcher: a.Fetcher})
			if err != nil {
				return nil, err
			}
			if len(result.Files) == 0 {
				return nil, errors.New(errors.NotFound, "File is not in an approved checkout")
			}
			return historyView{result.Files[0], now()}, nil
		},
		Restore: func(ctx context.Context, input inputs.Input) (any, error) {
			return restore.RestoreVersion(ctx, a, DashboardRestoreOptions(a, now, input))
		},
	}
}
