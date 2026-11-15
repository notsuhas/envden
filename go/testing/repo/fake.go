package repo

import "github.com/notsuhas/envden/go/core/adapters"

type Operations struct {
	ID              string
	CaseInsensitive func(root string, readOnly bool) (bool, error)
	CheckoutAt      func(path string) (*adapters.Checkout, error)
	Worktrees       func(c adapters.Checkout) ([]string, error)
	Submodules      func(c adapters.Checkout) ([]string, error)
	EnvFiles        func(c adapters.Checkout, rules *adapters.EnvFileRules) ([]string, error)
	IsIgnored       func(c adapters.Checkout, path string) (bool, error)
	EnsureIgnored   func(c adapters.Checkout, path string) error
}

type fake struct{ operations Operations }

func CreateFakeRepoAdapter(operations ...Operations) adapters.Repo {
	var o Operations
	if len(operations) > 0 {
		o = operations[0]
	}

	return &fake{o}
}

func (a *fake) ID() string {
	if a.operations.ID != "" {
		return a.operations.ID
	}

	return "fake-repo"
}

func (a *fake) CaseInsensitive(root string, readOnly bool) (bool, error) {
	if a.operations.CaseInsensitive == nil {
		panic("Unexpected fake operation: repo.caseInsensitive")
	}

	return a.operations.CaseInsensitive(root, readOnly)
}

func (a *fake) CheckoutAt(path string) (*adapters.Checkout, error) {
	if a.operations.CheckoutAt == nil {
		panic("Unexpected fake operation: repo.checkoutAt")
	}

	return a.operations.CheckoutAt(path)
}

func (a *fake) Worktrees(c adapters.Checkout) ([]string, error) {
	if a.operations.Worktrees == nil {
		panic("Unexpected fake operation: repo.worktrees")
	}

	return a.operations.Worktrees(c)
}

func (a *fake) Submodules(c adapters.Checkout) ([]string, error) {
	if a.operations.Submodules == nil {
		panic("Unexpected fake operation: repo.submodules")
	}

	return a.operations.Submodules(c)
}

func (a *fake) EnvFiles(c adapters.Checkout, rules *adapters.EnvFileRules) ([]string, error) {
	if a.operations.EnvFiles == nil {
		panic("Unexpected fake operation: repo.envFiles")
	}

	return a.operations.EnvFiles(c, rules)
}

func (a *fake) IsIgnored(c adapters.Checkout, path string) (bool, error) {
	if a.operations.IsIgnored == nil {
		panic("Unexpected fake operation: repo.isIgnored")
	}

	return a.operations.IsIgnored(c, path)
}

func (a *fake) EnsureIgnored(c adapters.Checkout, path string) error {
	if a.operations.EnsureIgnored == nil {
		panic("Unexpected fake operation: repo.ensureIgnored")
	}

	return a.operations.EnsureIgnored(c, path)
}
