package unknown

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/versions"
)

type Input struct {
	Received, Stored              []byte
	Mismatch                      string
	Verify                        func() (bool, error)
	UnknownFormat                 bool
	CurrentVersion, LatestVersion string
}

type Result struct{ Kind string }

func verified(fn func() (bool, error)) (ok bool) {
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	v, err := fn()

	return err == nil && v
}

func ClassifyUnknownData(input Input) (Result, error) {
	if input.Stored != nil && !b.Equal(input.Received, input.Stored) {
		return Result{Kind: input.Mismatch}, nil
	}
	if !verified(input.Verify) {
		return Result{Kind: "invalid"}, nil
	}
	if !input.UnknownFormat {
		return Result{Kind: "known"}, nil
	}
	cmp, err := versions.CompareSemver(input.CurrentVersion, input.LatestVersion)
	if err != nil {
		return Result{}, err
	}
	if cmp >= 0 {
		return Result{Kind: "unreadable"}, nil
	}

	return Result{Kind: "update-required"}, nil
}
