package server

import (
	"net/http"
	"net/url"
	"strings"

	mw "github.com/notsuhas/envden/go/server/middleware"
)

func normalizeRequestURL(r *http.Request) {
	path := strings.ReplaceAll(r.URL.EscapedPath(), "\\", "/")
	segments := strings.Split(path, "/")
	out := []string{}
	for i, part := range segments {
		dot := strings.ReplaceAll(strings.ToLower(part), "%2e", ".")
		switch dot {
		case ".":
			if i == len(segments)-1 {
				out = append(out, "")
			}
		case "..":
			if len(out) > 1 {
				out = out[:len(out)-1]
			}
			if i == len(segments)-1 {
				out = append(out, "")
			}
		default:
			out = append(out, part)
		}
	}
	normalized := strings.Join(out, "/")
	decoded, err := url.PathUnescape(normalized)
	if err == nil {
		r.URL.Path = decoded
		r.URL.RawPath = normalized
	}
}
func tooLarge(w http.ResponseWriter, r *http.Request) bool {
	if r.ContentLength <= mw.MaxRequestBodySize {
		return false
	}
	if hijacker, ok := w.(http.Hijacker); ok {
		conn, buffer, err := hijacker.Hijack()
		if err == nil {
			defer conn.Close()
			_, _ = buffer.WriteString("HTTP/1.1 413 Request Entity Too Large\r\nConnection: close\r\n\r\n")
			_ = buffer.Flush()
			return true
		}
	}
	w.WriteHeader(413)
	return true
}
