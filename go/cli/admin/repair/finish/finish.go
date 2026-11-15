package finish

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/admin/repair/completion"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/client/routes"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	r "github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Options struct {
	Token, Password string
	Without         []string
	AcceptLost      bool
	Now             func() int64
	Fetcher         client.Fetch
}

func FinishRepair(ctx context.Context, a contracts.Adapters, o Options) (repair.Result, error) {
	var result repair.Result
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		var err error
		result, err = client.RetryHead(func() (repair.Result, error) { return attempt(ctx, a, o) })
		return err
	})
	return result, err
}

func attempt(ctx context.Context, a contracts.Adapters, o Options) (repair.Result, error) {
	resumed, err := repair.ResumeClose(ctx, a, o.Token, o.Now, o.Fetcher)
	if err != nil {
		return repair.Result{}, err
	}
	if resumed != nil {
		return *resumed, nil
	}
	c, err := repair.RepairContext(ctx, a, o.Token, o.Now, o.Fetcher)
	if err != nil {
		return repair.Result{}, err
	}
	h, err := shared.ReadHistory(ctx, c.Client, c.VaultID)
	if err != nil {
		return repair.Result{}, err
	}
	status, err := routes.Do(ctx, c.Client, routes.Route[s.RepairStatus]{Path: "/v1/repair/status", Method: "GET", Schema: s.RepairStatusSchema}, nil)
	if err != nil {
		return repair.Result{}, err
	}
	id, err := client.Binary(status.RepairId)
	if err != nil {
		return repair.Result{}, err
	}
	if !b.Equal(id, c.RepairID) {
		return repair.Result{}, errors.New(errors.InvalidData, "Repair identity mismatch")
	}
	h, err = repair.DropDevices(ctx, c.Context, h, o.Without)
	if err != nil {
		return repair.Result{}, err
	}
	reports, err := completion.RepairReports(ctx, c.Context, h, c.RepairID)
	if err != nil {
		return repair.Result{}, err
	}
	missing := r.MissingReportMembers(h.State, reports)
	if len(missing) > 0 {
		names := []string{}
		for _, d := range missing {
			names = append(names, d.Name)
		}
		return repair.Result{Kind: "missing-reports", Devices: names}, nil
	}
	files, err := completion.RepairFiles(ctx, c.Context, h)
	if err != nil {
		return repair.Result{}, err
	}
	available, err := completion.AvailableBlobs(ctx, c.Context)
	if err != nil {
		return repair.Result{}, err
	}
	gaps := r.ClassifyMissingBlobs(files, available, reports)
	if completion.DeriveGapAction(len(gaps.Missing), len(gaps.Lost), o.AcceptLost) == "report" {
		return completion.MissingBlobNames(ctx, c.Context, h, gaps)
	}
	if len(gaps.Lost) > 0 {
		if err = repair.FixLost(ctx, c.Context, h, files, gaps.Lost, available, c.RepairID); err != nil {
			return repair.Result{}, err
		}
		h, err = shared.ReadHistory(ctx, c.Client, c.VaultID)
		if err != nil {
			return repair.Result{}, err
		}
	}
	if err = completion.CloseRepair(ctx, c, h, status, o.Password); err != nil {
		return repair.Result{}, err
	}
	resumed, err = repair.ResumeClose(ctx, a, o.Token, o.Now, o.Fetcher)
	if err != nil {
		return repair.Result{}, err
	}
	if resumed == nil {
		return repair.Result{}, errors.New(errors.InvalidData, "Repair close was not committed")
	}
	return *resumed, nil
}
