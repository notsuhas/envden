package model

import (
	"context"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Options struct {
	AtomicWrite func(string, []byte) error
	Now         func() int64
	Fetcher     client.Fetch
	Cwd         string
	All, Yes    bool
	Interactive *bool
	Confirm     func([]string) (bool, error)
	Unlock      func(context.Context, *client.Client, []byte) error
	Choose      func(string) (string, error)
	Report      func(string)
}

type Links struct {
	ApprovedCheckout      func(adapters.Repo, *state.State, string) (*adapters.Checkout, error)
	CheckoutApproval      func(*state.State, adapters.Checkout) string
	PruneMissingCheckouts func(string, *state.State, func(string), func() int64) error
	SupportedPlacement    func(contracts.Adapters, string) (string, error)
	AliasRepo             func(context.Context, contracts.Adapters, string, string) error
}

type Context struct {
	Context      context.Context
	Adapters     contracts.Adapters
	Options      Options
	State        *state.State
	SkippedRoots map[string]bool
	Identity     identity.Identity
	VaultID      []byte
	Client       *client.Client
	Checkpoint   chain.Checkpoint
	Headers      []b.Signed[m.ManifestHeader]
	Entries      []b.Signed[c.Entry]
	Keys         map[int][]byte
	Links        Links
}

func (c *Context) Report(message string) {
	if c.Options.Report != nil {
		c.Options.Report(message)
	}
}

func Alias(state *state.State, id string) string {
	if alias, ok := state.Aliases.Get(id).(string); ok {
		return alias
	}

	return id
}

func (o Options) NonInteractive() bool { return o.Interactive != nil && !*o.Interactive }

func IsCancelled(err error) bool {
	value, ok := e.As(err)

	return ok && value.Code == e.InvalidInput && value.Message == "Cancelled"
}
