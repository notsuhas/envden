package client

import "context"

type authenticatedKey struct{}

func WithAuthenticated(ctx context.Context, callback func() error) context.Context {
	return context.WithValue(ctx, authenticatedKey{}, callback)
}

func authenticated(ctx context.Context) error {
	if callback, ok := ctx.Value(authenticatedKey{}).(func() error); ok {
		return callback()
	}
	return nil
}
