package notice

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	bounded "github.com/notsuhas/envden/go/cli/notice/fetch"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
)

func DefaultHooks(w io.Writer) Hooks {
	return Hooks{Pending: func(home string, now func() int64) error { return ReportPendingJoins(home, now, w) }, Remote: func(ctx context.Context, a contracts.Adapters, now int64) error {
		fetch, cancel := bounded.BoundedFetch(ctx, a.Fetcher)
		defer cancel()
		a.Fetcher = fetch
		a.HelloCache = client.NewHelloCache()
		_, e := RemoteNotice(ctx, a, syncmodel.Options{Now: func() int64 { return now }, Fetcher: fetch, All: true})

		return e
	}}
}
