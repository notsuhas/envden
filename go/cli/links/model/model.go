package model

import "github.com/notsuhas/envden/go/core/adapters"

type OwnLink struct {
	Checkout           adapters.Checkout
	Path, Link, Target string
}
type OwnLinkGroup struct {
	Target string
	Links  []OwnLink
}
