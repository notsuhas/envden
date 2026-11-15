package stub

import (
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
)

func Action(*commander.Invocation) error { return errors.New(errors.NotImplemented, "not implemented") }
