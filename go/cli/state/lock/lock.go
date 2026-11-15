package lock

import (
	"context"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/errors"
)

type heldKey struct{}

func WithStateLock(ctx context.Context, home string, timing Timing, fn func(context.Context) error) error {
	root, err := filepath.Abs(home)
	if err != nil {
		return err
	}

	path := filepath.Join(root, "state", "write.lock")
	held, _ := ctx.Value(heldKey{}).(map[string]bool)
	if held[path] {
		return fn(ctx)
	}

	if err = files.PrivateDirectory(filepath.Dir(path)); err != nil {
		return err
	}

	token := uuid.NewString()
	observed := ProcessStart(os.Getpid())
	if observed.Kind != "live" {
		return errors.New(errors.Internal, "Cannot identify lock owner")
	}

	if err = AcquireLock(path, timing); err != nil {
		return err
	}

	directory, err := os.Lstat(path)
	if err != nil {
		return err
	}

	defer func() {
		if ownerToken(path) == token {
			_ = os.RemoveAll(path) // Best-effort cleanup preserves the original operation result.
		}
	}()
	if err = PublishOwner(path, Owner{os.Getpid(), observed.StartedAt, token, ProcessIdentity(), timing.Now()}); err != nil {
		return err
	}

	published, err := os.Lstat(path)
	if err != nil {
		return err
	}

	if !os.SameFile(directory, published) {
		return errors.New(errors.Conflict, "Lock ownership changed")
	}

	current := map[string]bool{}
	for p := range held {
		current[p] = true
	}

	current[path] = true

	return fn(context.WithValue(ctx, heldKey{}, current))
}
