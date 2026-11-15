package restore

import "github.com/notsuhas/envden/go/core/errors"

func RestoreRefusal(managed, localOnly, detached, conflicted bool) error {
	if !managed {
		return errors.New(errors.NotFound, "File is not managed by envden")
	}
	if localOnly {
		return errors.New(errors.InvalidInput, "Local-only files are not restored from history")
	}
	if detached {
		return errors.New(errors.Conflict, "File is detached; reconcile it with envden pull before restoring")
	}
	if conflicted {
		return errors.New(errors.Conflict, "File has a conflict; run envden resolve first")
	}
	return nil
}
