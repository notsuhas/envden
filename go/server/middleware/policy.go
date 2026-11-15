package middleware

import (
	"net/http"
	"regexp"
	"strconv"

	enverrors "github.com/notsuhas/envden/go/core/errors"
)

type Route struct {
	Method string
	Path   *regexp.Regexp
	Limit  int64
	Policy string
	Charge bool
}

var routes = []Route{
	{"GET", regexp.MustCompile(`^/v1/hello$`), 0, "", false},
	{"GET", regexp.MustCompile(`^/(v1/status)?$`), 0, "", false},
	{"POST", regexp.MustCompile(`^/v1/vault$`), 65536, "data", false},
	{"POST", regexp.MustCompile(`^/v1/swap$`), 33554432, "data", false},
	{"GET", regexp.MustCompile(`^/v1/(head|headers|entries|envelope)$`), 0, "data", false},
	{"GET", regexp.MustCompile(`^/v1/(devices|blobs)$`), 0, "", false},
	{"GET", regexp.MustCompile(`^/v1/(files|keyrings|blobs)/[^/]+$`), 0, "data", false},
	{"PUT", regexp.MustCompile(`^/v1/blobs/[^/]+$`), 16777216, "data", false},
	{"POST", regexp.MustCompile(`^/v1/opaque/login/start$`), 65536, "kit", true},
	{"POST", regexp.MustCompile(`^/v1/opaque/login/finish$`), 65536, "kit", false},
	{"POST", regexp.MustCompile(`^/v1/opaque/registration/start$`), 65536, "registration", true},
	{"POST", regexp.MustCompile(`^/v1/opaque/registration/finish$`), 65536, "registration", false},
	{"POST", regexp.MustCompile(`^/v1/pairing/mailboxes$`), 65536, "", false},
	{"GET", regexp.MustCompile(`^/v1/pairing/mailboxes/[1-9][0-9]{0,2}/(KE1|KE2|KE3|PairJoiner)$`), 0, "mailbox", false},
	{"PUT", regexp.MustCompile(`^/v1/pairing/mailboxes/[1-9][0-9]{0,2}/(KE1|KE2|KE3|PairJoiner)$`), 65536, "mailbox", false},
	{"DELETE", regexp.MustCompile(`^/v1/pairing/mailboxes/[1-9][0-9]{0,2}$`), 0, "", false},
	{"GET", regexp.MustCompile(`^/v1/pairing/approver$`), 0, "approver", false},
	{"GET", regexp.MustCompile(`^/v1/settings/unlock-period$`), 0, "", false},
	{"GET", regexp.MustCompile(`^/v1/unlock-window$`), 0, "", false},
	{"PUT", regexp.MustCompile(`^/v1/settings/unlock-period$`), 65536, "", false},
	{"POST", regexp.MustCompile(`^/v1/move/(discard|session|freeze|unfreeze)$`), 65536, "data", false},
	{"GET", regexp.MustCompile(`^/v1/move/(sk-pub|period)$`), 0, "data", false},
	{"PUT", regexp.MustCompile(`^/v1/move/period$`), 65536, "data", false},
	{"POST", regexp.MustCompile(`^/v1/(move|repair)/(history|chain)$`), 33554432, "data", false},
	{"PUT", regexp.MustCompile(`^/v1/(move|repair)/material/[^/]+/[^/]+$`), 33554432, "data", false},
	{"POST", regexp.MustCompile(`^/v1/repair/finish$`), 65536, "data", false},
	{"PUT", regexp.MustCompile(`^/v1/repair/report$`), 3200182, "data", false},
	{"GET", regexp.MustCompile(`^/v1/repair/(status|reports)$`), 0, "data", false},
}

func Match(method, path string) *Route {
	for _, route := range routes {
		if route.Method == method && route.Path.MatchString(path) {
			return &route
		}
	}

	return nil
}

func RequestRoute(r *http.Request) (*Route, error) {
	route := Match(r.Method, r.URL.EscapedPath())
	if route == nil {
		return nil, enverrors.New(enverrors.NotFound, "Unknown route")
	}
	length, _ := strconv.ParseFloat(r.Header.Get("Content-Length"), 64)
	if route.Limit == 0 && (r.Body != nil && r.Body != http.NoBody || length > 0) {
		return nil, enverrors.New(enverrors.InvalidInput, "Request body not allowed")
	}

	return route, nil
}
