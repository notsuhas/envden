package adapters

// Shell is the out-of-sync line in a shell rc file.
type Shell interface {
	ID() string
	RCPath() string
	HookSnippet(binaryPath string) string
	Installed() (bool, error)
	Install(binaryPath string) error
	Uninstall() error
}
