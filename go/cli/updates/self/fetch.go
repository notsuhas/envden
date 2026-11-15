package self

import (
	"io"
	"net/http"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
)

func follow(fetch client.Fetch, r *http.Request) (*http.Response, error) {
	for redirects := 0; redirects <= 20; redirects++ {
		response, e := fetch(r)
		if e != nil {
			return nil, e
		}

		if response.StatusCode < 300 || response.StatusCode >= 400 || response.Header.Get("Location") == "" {
			return response, nil
		}

		_, _ = io.Copy(io.Discard, response.Body) // Draining is best effort before closing the response.
		_ = response.Body.Close()                 // Best-effort cleanup preserves the original operation result.
		location, e := r.URL.Parse(response.Header.Get("Location"))
		if e != nil {
			return nil, e
		}

		next, e := http.NewRequestWithContext(r.Context(), "GET", location.String(), nil)
		if e != nil {
			return nil, e
		}

		r = next
	}

	return nil, errors.New(errors.InvalidData, "Release download failed")
}
