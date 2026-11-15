package shell

import "github.com/notsuhas/envden/go/core/adapters"

type Operations struct {
	ID          string
	RCPath      func() string
	HookSnippet func(binary string) string
	Installed   func() (bool, error)
	Install     func(binary string) error
	Uninstall   func() error
}

type fake struct{ operations Operations }

func CreateFakeShellAdapter(operations ...Operations) adapters.Shell {
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
	return "fake-shell"
}

func (a *fake) RCPath() string {
	if a.operations.RCPath == nil {
		panic("Unexpected fake operation: shell.rcPath")
	}
	return a.operations.RCPath()
}

func (a *fake) HookSnippet(binary string) string {
	if a.operations.HookSnippet == nil {
		panic("Unexpected fake operation: shell.hookSnippet")
	}
	return a.operations.HookSnippet(binary)
}

func (a *fake) Installed() (bool, error) {
	if a.operations.Installed == nil {
		panic("Unexpected fake operation: shell.installed")
	}
	return a.operations.Installed()
}

func (a *fake) Install(binary string) error {
	if a.operations.Install == nil {
		panic("Unexpected fake operation: shell.install")
	}
	return a.operations.Install(binary)
}

func (a *fake) Uninstall() error {
	if a.operations.Uninstall == nil {
		panic("Unexpected fake operation: shell.uninstall")
	}
	return a.operations.Uninstall()
}
