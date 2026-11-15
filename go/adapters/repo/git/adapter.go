package git

import (
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

type Options struct {
	ResolveSSHHost func(string) (string, error)
	SkipFolders    []string
}

type adapter struct{ options Options }

func CreateGitRepoAdapter(options ...Options) adapters.Repo {
	var o Options
	if len(options) > 0 {
		o = options[0]
	}
	if o.ResolveSSHHost == nil {
		o.ResolveSSHHost = resolveSSHHost
	}

	return &adapter{o}
}

func (a *adapter) ID() string { return "git" }

func repoFailure(err error) error {
	if err == nil {
		return nil
	}
	if _, ok := errors.As(err); ok {
		return err
	}

	return errors.Wrap(errors.Internal, "Repository operation failed", err)
}

func (a *adapter) CaseInsensitive(root string, readOnly bool) (bool, error) {
	v, e := caseInsensitive(root, readOnly)

	return v, repoFailure(e)
}

func (a *adapter) CheckoutAt(path string) (*adapters.Checkout, error) {
	v, e := checkoutAt(path, a.options.ResolveSSHHost)

	return v, repoFailure(e)
}

func (a *adapter) Worktrees(c adapters.Checkout) ([]string, error) {
	v, e := worktrees(func(args []string) (string, error) { return git(c.Root, args, "") })

	return v, repoFailure(e)
}

func (a *adapter) Submodules(c adapters.Checkout) ([]string, error) {
	v, e := git(c.Root, []string{"config", "--file", c.Root + "/.gitmodules", "--no-includes", "-z", "--get-regexp", `^submodule\..*\.path$`}, "")
	if exitCode(e) == 1 {
		return []string{}, nil
	}
	if e != nil {
		return nil, repoFailure(e)
	}

	return submodulePaths(v), nil
}

func (a *adapter) EnvFiles(c adapters.Checkout, rules *adapters.EnvFileRules) ([]string, error) {
	r := adapters.EnvFileRules{}
	if rules != nil {
		r = *rules
	}
	r.ExtraSkipped = append(append([]string{}, a.options.SkipFolders...), r.ExtraSkipped...)
	v, e := envFiles(c, &r)

	return v, repoFailure(e)
}

func (a *adapter) IsIgnored(c adapters.Checkout, path string) (bool, error) {
	v, e := isIgnored(c, path)

	return v, repoFailure(e)
}

func (a *adapter) EnsureIgnored(c adapters.Checkout, path string) error {
	return repoFailure(ensureIgnored(c, path))
}
