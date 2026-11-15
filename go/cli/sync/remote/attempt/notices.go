package attempt

import (
	"github.com/notsuhas/envden/go/cli/sync/local/lineage"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/placement"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
)

func ReportBlocked(context *sm.Context) error {
	notices, err := lineage.HeldBackFiles(context.Adapters, context.Links)
	if err != nil {
		return err
	}
	for _, notice := range notices {
		context.Report("Held back " + placement.CheckoutPath(context.Options.Cwd, notice.Path, "") + ": " + notice.Reason)
	}

	return nil
}
