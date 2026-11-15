package updates

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/version"
	semver "github.com/notsuhas/envden/go/core/protocol/versions"
	"os"
	"path/filepath"
)

type Status struct {
	Available bool   `json:"available"`
	Required  bool   `json:"required"`
	Message   string `json:"message,omitempty"`
}

func UpdateStatus(home string) Status {
	c := ReadUpdateCache(home)
	required, _ := os.ReadFile(filepath.Join(home, "state", "update-required"))
	return Status{Available: newer(c.Latest, version.Version), Required: string(required) == version.Version, Message: c.Message}
}
func RecordUpdateRequired(home string, err error, now func() int64) error {
	if err != nil && err.Error() == "The server requires a version that doesn't exist" {
		return nil
	}
	return files.AtomicWrite(filepath.Join(home, "state", "update-required"), []byte(version.Version), now)
}

type homeKey struct{}

func WithUpdateStatus(ctx context.Context, home string, action func(context.Context) error) error {
	ctx = context.WithValue(ctx, homeKey{}, home)
	return action(client.WithAuthenticated(ctx, func() error { return AuthenticatedRequestSucceeded(ctx) }))
}
func AuthenticatedRequestSucceeded(ctx context.Context) error {
	home, _ := ctx.Value(homeKey{}).(string)
	if home == "" {
		return nil
	}
	err := os.Remove(filepath.Join(home, "state", "update-required"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func newer(a, b string) bool { n, e := semver.CompareSemver(a, b); return e == nil && n > 0 }
