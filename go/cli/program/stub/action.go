package stub

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/core/errors"
)

func Action(*command.Invocation) error { return errors.New(errors.NotImplemented, "not implemented") }
