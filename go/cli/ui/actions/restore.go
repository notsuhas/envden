package actions

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/history/restore"
	"github.com/notsuhas/envden/go/cli/ui/routes/inputs"
)

func DashboardRestoreOptions(a contracts.Adapters, now func() int64, target inputs.Input) restore.Options {
	return restore.Options{Cwd: target.Root, File: target.Path, Version: uint64(target.Version), Yes: true, Interactive: true, Confirm: func(string) (bool, error) { return true, nil }, Now: now, Fetcher: a.Fetcher}
}
