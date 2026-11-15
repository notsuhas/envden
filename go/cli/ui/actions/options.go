package actions

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
)

func DashboardSyncOptions(a contracts.Adapters, now func() int64) syncmodel.Options {
	interactive := false
	return syncmodel.Options{Now: now, Fetcher: a.Fetcher, All: true, Yes: true, Interactive: &interactive}
}
