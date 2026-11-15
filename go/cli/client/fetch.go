package client

import (
	"fmt"
	"github.com/notsuhas/envden/go/core/errors"
	"net/http"
)

type Fetch func(*http.Request) (*http.Response, error)

func ServerFetch(fetch Fetch, request *http.Request) (*http.Response, error) {
	response, err := fetch(request)
	if err == nil && response.StatusCode >= 300 && response.StatusCode < 400 {
		response.Body.Close()
		err = fmt.Errorf("Unexpected redirect")
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
	return (&http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}).Do(request)
}
