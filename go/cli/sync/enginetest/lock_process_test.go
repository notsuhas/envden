package enginetest

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"testing"

	"github.com/notsuhas/envden/go/cli/state/lock"
)

func TestKilledSyncLockOwner(t *testing.T) {
	home := os.Getenv("ENVDEN_SYNC_LOCK_CHILD")
	if home != "" {
		err := lock.WithStateLock(context.Background(), home, lock.Timing{Now: clock}, func(context.Context) error {
			fmt.Println("locked")
			select {}
		})
		if err != nil {
			t.Fatal(err)
		}
		return
	}
	home = t.TempDir()
	binary, err := os.Executable()
	must(t, err)
	child := exec.Command(binary, "-test.run=^TestKilledSyncLockOwner$")
	child.Env = append(os.Environ(), "ENVDEN_SYNC_LOCK_CHILD="+home)
	stdout, err := child.StdoutPipe()
	must(t, err)
	must(t, child.Start())
	t.Cleanup(func() { _ = child.Process.Kill(); _ = child.Wait() })
	scanner := bufio.NewScanner(stdout)
	locked := false
	for scanner.Scan() {
		if scanner.Text() == "locked" {
			locked = true
			break
		}
	}
	if !locked {
		t.Fatal("child never acquired sync lock", scanner.Err())
	}
	must(t, child.Process.Kill())
	if err = child.Wait(); err == nil {
		t.Fatal("child must be killed")
	}
	resumed := ""
	must(t, lock.WithStateLock(context.Background(), home, lock.Timing{Now: clock}, func(context.Context) error { resumed = "resumed"; return nil }))
	equal(t, resumed, "resumed")
}
