package client

import (
	"fmt"
	"net/http"

	"github.com/notsuhas/envden/go/core/errors"
)

type Fetch func(*http.Request) (*http.Response, error)

func ServerFetch(fetch Fetch, request *http.Request) (*http.Response, error) {
	response, err := fetch(request)
	if err == nil && response.StatusCode >= 300 && response.StatusCode < 400 {
		_ = response.Body.Close()               // Best-effort cleanup preserves the original operation result.
		err = fmt.Errorf("Unexpected redirect") //nolint:staticcheck // Preserve the exact TS error text.
	}

	if err == nil {
		return response, nil
	}

	if _, ok := errors.As(err); ok {
		return nil, err
	}

	return nil, errors.Wrap(errors.ServerUnreachable, "Server unreachable; check the server address and your private network", err)
}

func DefaultFetch(request *http.Request) (*http.Response, error) {
	return (&http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}).Do(request) //nolint:gosec // The server address is supplied by the user and redirects are disabled.
}
