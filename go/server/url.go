package server

import (
	"net/http"
	"net/url"
	"strings"

	whatwg "github.com/nlnwa/whatwg-url/url"
	"github.com/notsuhas/envden/go/server/middleware"
)

func normalizeRequestURL(r *http.Request) {
	raw := r.RequestURI
	if strings.HasPrefix(raw, "/") {
		raw = "http://envden.invalid" + raw
	}
	parsed, err := whatwg.Parse(raw)
	if err != nil {
		return
	}
	normalized := parsed.Pathname()
	decoded, err := url.PathUnescape(normalized)
	if err == nil {
		r.URL.Path = decoded
		r.URL.RawPath = normalized
	}
}

func tooLarge(w http.ResponseWriter, r *http.Request) bool {
	if r.ContentLength <= middleware.MaxRequestBodySize {
		return false
	}
	if hijacker, ok := w.(http.Hijacker); ok {
		conn, buffer, err := hijacker.Hijack()
		if err == nil {
			defer func() { _ = conn.Close() }()
			_, _ = buffer.WriteString("HTTP/1.1 413 Request Entity Too Large\r\nConnection: close\r\n\r\n")
			_ = buffer.Flush()

			return true
		}
	}
	w.WriteHeader(413)

	return true
}
