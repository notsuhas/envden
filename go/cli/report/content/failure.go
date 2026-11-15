package content

import (
	"errors"

	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

type Failure struct {
	Code, Message string
	Causes        []string
	Stack         string
}

func DescribeFailure(err error) Failure {
	f := Failure{Code: "Error", Message: err.Error(), Causes: []string{}}
	if v, ok := envdenerrors.As(err); ok {
		f.Code = string(v.Code)
	}

	cause := errors.Unwrap(err)
	for cause != nil && len(f.Causes) < 5 {
		f.Causes = append(f.Causes, cause.Error())
		cause = errors.Unwrap(cause)
	}

	return f
}
