package status

import (
	"errors"
	"net"
	"strings"
	"syscall"

	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func ServerReachability(err error) (string, string) {
	if v, ok := envdenerrors.As(err); ok {
		if v.Code == envdenerrors.ServerUnreachable {
			return "unreachable", transportReason(v.Cause)
		}

		return "error", v.Message
	}

	return "error", "unexpected error"
}

func transportReason(err error) string {
	if err == nil {
		return "network error"
	}

	var n net.Error
	if errors.As(err, &n) && n.Timeout() {
		return "timed out"
	}

	var dns *net.DNSError
	if errors.As(err, &dns) {
		return "address not found"
	}

	if errors.Is(err, syscall.ECONNREFUSED) {
		return "connection refused"
	}

	if errors.Is(err, syscall.ECONNRESET) {
		return "connection reset"
	}

	text := err.Error()
	for _, row := range [][2]string{{"ConnectionRefused", "connection refused"}, {"ECONNREFUSED", "connection refused"}, {"ENOTFOUND", "address not found"}, {"ECONNRESET", "connection reset"}, {"CERT", "TLS certificate rejected"}} {
		if strings.Contains(text, row[0]) {
			return row[1]
		}
	}

	return "network error"
}
