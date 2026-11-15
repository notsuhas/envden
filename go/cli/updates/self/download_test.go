package self

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestDownloadUpdate(t *testing.T) {
	for _, bad := range []bool{false, true} {
		fetch := func(r *http.Request) (*http.Response, error) {
			body := "binary"
			status := 200
			header := http.Header{}
			switch {
			case strings.Contains(r.URL.Path, "/releases/latest"):
				status = 302
				header.Set("Location", "https://github.com/notsuhas/envden/releases/tag/v99.0.0")
				body = ""
			case strings.HasSuffix(r.URL.Path, "SHA256SUMS"):
				sum := sha256.Sum256([]byte("binary"))
				if bad {
					sum[0] ^= 1
				}
				body = fmt.Sprintf("%x  envden-darwin-arm64\n", sum)
			}

			return &http.Response{StatusCode: status, Header: header, Body: io.NopCloser(strings.NewReader(body))}, nil
		}
		bytes, e := DownloadUpdate(context.Background(), fetch, "0.3.8", "darwin-arm64")
		if bad {
			if !errors.Is(e, errors.InvalidData) || e.Error() != "Build checksum mismatch" {
				t.Fatal(e)
			}
		} else if e != nil || string(bytes) != "binary" {
			t.Fatal(string(bytes), e)
		}
	}
}
