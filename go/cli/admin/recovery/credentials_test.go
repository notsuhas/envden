package recovery_test

import (
	"github.com/notsuhas/envden/go/cli/admin/devices"
	admin "github.com/notsuhas/envden/go/cli/admin/recovery"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/core/errors"
	"testing"
)

func TestCredentialsAndRevocation(t *testing.T) {
	f := newFixture(t, true)
	if err := devices.RotateVault(f.ctx, f.a, "old password", f.now, f.a.Fetcher); err != nil {
		t.Fatal(err)
	}
	kind, err := devices.RenameDevice(f.ctx, f.b, "laptop", f.now, f.b.Fetcher)
	if err != nil || kind != "renamed" {
		t.Fatal(kind, err)
	}
	ds, err := devices.ListDevices(f.ctx, f.a, f.now, f.a.Fetcher)
	if err != nil || len(ds) != 2 || ds[1].Name != "laptop" || !ds[1].RecoveryKeyHeld {
		t.Fatal(ds, err)
	}
	kind, err = devices.RenameDevice(f.ctx, f.b, "laptop", f.now, f.b.Fetcher)
	if err != nil || kind != "unchanged" {
		t.Fatal(kind, err)
	}
	passwords := 0
	_, err = devices.RemoveDevice(f.ctx, f.a, "missing", devices.RemoveOptions{Now: f.now, Fetcher: f.a.Fetcher, Password: func() (string, error) { passwords++; return "old password", nil }})
	if !errors.Is(err, errors.NotFound) || passwords != 0 {
		t.Fatal(passwords, err)
	}
	result, err := devices.RemoveDevice(f.ctx, f.a, "laptop", devices.RemoveOptions{Now: f.now, Fetcher: f.a.Fetcher, Password: func() (string, error) { return "old password", nil }, Confirm: func(exposure devices.Exposure) (bool, error) { return true, nil }})
	if err != nil || result.Kind != "removed" || !result.RecommendNewKit {
		t.Fatal(result, err)
	}
	c, err := shared.AdminContext(f.ctx, f.b, f.now, f.b.Fetcher)
	if err != nil {
		t.Fatal(err)
	}
	if err = shared.Send(f.ctx, c.Client, "/v1/head", "GET", nil); !errors.Is(err, errors.Unauthorized) {
		t.Fatal(err)
	}
	shown := 0
	replaced, err := admin.ReplaceKit(f.ctx, f.a, "old password", f.now, func(admin.ReplacementKit) error { shown++; return nil }, f.a.Fetcher, nil)
	if err != nil || replaced.Kind != "replaced" || shown != 1 {
		t.Fatal(replaced, shown, err)
	}
	if err = admin.ChangePassword(f.ctx, f.a, "old password", "new password", replaced.Kit.SecretKey, f.now, f.a.Fetcher); err != nil {
		t.Fatal(err)
	}
	if err = admin.ResetPassword(f.ctx, f.a, "reset password", replaced.Kit.SecretKey, f.now, f.a.Fetcher); err != nil {
		t.Fatal(err)
	}
	c, err = shared.AdminContext(f.ctx, f.a, f.now, f.a.Fetcher)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = session.Login(f.ctx, c.Client, c.VaultID, session.Password{Value: "reset password"}, ""); err != nil {
		t.Fatal(err)
	}
}
