package discovery

import (
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

type RepoSkip struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
	Kind   string `json:"kind"`
}

func Identify(repo adapters.Repo, path string, report func(RepoSkip)) *adapters.Checkout {
	item, err := repo.CheckoutAt(path)
	if err == nil && item != nil {
		return item
	}

	skip := RepoSkip{path, "Repository identity unavailable", "identity"}
	if e, ok := errors.As(err); ok {
		skip.Reason = e.Message
		if e.Code == errors.InvalidInput {
			skip.Kind = "remote"
		}
	}

	if report != nil {
		report(skip)
	}

	return nil
}
