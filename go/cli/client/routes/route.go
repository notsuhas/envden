package routes

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"io"
)

type Route[T any] struct {
	Path, Method string
	Schema       p.Schema[T]
}

func Do[T any](ctx context.Context, c *client.Client, route Route[T], body any) (T, error) {
	var zero T
	response, err := c.Request(ctx, route.Path, route.Method, body)
	if err != nil {
		return zero, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return zero, err
	}
	return route.Schema.Decode(raw)
}
func Bytes(ctx context.Context, c *client.Client, path, method string, body []byte) ([]byte, error) {
	response, err := c.Request(ctx, path, method, body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	return io.ReadAll(response.Body)
}
