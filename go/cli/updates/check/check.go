package check

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	bounded "github.com/notsuhas/envden/go/cli/notice/fetch"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/protocol/versions"
	"time"
)

type Result struct {
	Kind      string `json:"kind"`
	Latest    string `json:"latest,omitempty"`
	Available *bool  `json:"available,omitempty"`
	Message   string `json:"message,omitempty"`
}

func CheckRelease(ctx context.Context, checkedAt *int64, now int64, fetch client.Fetch, force bool) Result {
	if !force && checkedAt != nil && now-*checkedAt < 86400000 {
		return Result{Kind: "skipped"}
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	fetch, stop := bounded.BoundedFetch(ctx, fetch)
	defer stop()
	latest, e := LatestRelease(ctx, fetch)
	if e != nil {
		return Result{Kind: "unavailable", Message: "Cannot confirm envden is up to date"}
	}
	n, _ := versions.CompareSemver(latest, version.Version)
	available := n > 0
	return Result{Kind: "checked", Latest: latest, Available: &available}
}
