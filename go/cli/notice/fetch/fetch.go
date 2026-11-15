package fetch

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"io"
	"net/http"
	"time"
)

func BoundedFetch(ctx context.Context, fetch client.Fetch) (client.Fetch, context.CancelFunc) {
	deadline, cancel := context.WithTimeout(ctx, 2*time.Second)
	return func(r *http.Request) (*http.Response, error) {
		ctx, stop := context.WithCancel(r.Context())
		remove := context.AfterFunc(deadline, stop)
		if e := deadline.Err(); e != nil {
			stop()
			remove()
			return nil, e
		}
		type result struct {
			response *http.Response
			err      error
		}
		done := make(chan result)
		go func() {
			response, e := fetch(r.Clone(ctx))
			select {
			case done <- result{response, e}:
			case <-ctx.Done():
				if response != nil {
					response.Body.Close()
				}
			}
		}()
		select {
		case got := <-done:
			if got.err != nil {
				remove()
				stop()
				return nil, got.err
			}
			got.response.Body = &cancelBody{ReadCloser: got.response.Body, cancel: func() { remove(); stop() }}
			return got.response, nil
		case <-ctx.Done():
			remove()
			stop()
			return nil, ctx.Err()
		}
	}, cancel
}

type cancelBody struct {
	io.ReadCloser
	cancel func()
}

func (b *cancelBody) Close() error { defer b.cancel(); return b.ReadCloser.Close() }
