package check

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/release"
)

const ReleaseRepository = "notsuhas/envden"

func ReleaseAssetURL(version, name string) string {
	return "https://github.com/" + ReleaseRepository + "/releases/download/v" + version + "/" + name
}
func LatestRelease(ctx context.Context, fetch client.Fetch) (string, error) {
	return release.Latest(ctx, fetch)
}
