package enginetest

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/vault/initial"
)

func assertPairingDevice(t *testing.T, list []devices.Device, id string, unconfirmed bool) {
	t.Helper()
	for _, d := range list {
		if d.ID != id {
			continue
		}
		equal(t, d.Unconfirmed, unconfirmed)
		if unconfirmed {
			if d.ClientVersion != nil {
				t.Fatal("unconfirmed device has a client version")
			}
		} else {
			if d.ClientVersion == nil {
				t.Fatal("confirmed device has no client version")
			}
			equal(t, *d.ClientVersion, "0.0.0")
		}
		return
	}
	t.Fatal("paired device missing")
}

func TestPairingCheckpointAdvancesExactlyOnceOnPull(t *testing.T) {
	f := pairedFixture(t, func(f *fixture) { must(t, devices.RotateVault(f.ctx, f.first, "old password", clock, nil)) })
	equal(t, len(f.state(f.second).Headers), 3)
	f.pull(f.second)
	equal(t, len(f.state(f.second).Headers), 4)
	f.pull(f.second)
	equal(t, len(f.state(f.second).Headers), 4)
}

func TestInitialPushDoesNotRecordBaselinesAfterOtherCommit(t *testing.T) {
	f := pairedFixture(t, nil)
	must(t, os.Remove(filepath.Join(f.first.Home, "state", "applied-files.json")))
	must(t, initial.PushInitialFiles(f.ctx, f.first, f.state(f.first), nil, nil))
	applied, err := local.AppliedFiles(f.first.Home)
	must(t, err)
	equal(t, len(applied), 0)
}
