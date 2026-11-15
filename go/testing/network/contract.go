package network

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	errors "github.com/notsuhas/envden/go/core/errors"
)

func NetworkContract(t *testing.T, factory func(string) adapters.Network) {
	t.Helper()
	t.Run("ready publishes secure address", func(t *testing.T) {
		a := factory("ready")
		s, e := a.Status()
		if e != nil || !s.Ready || !s.Running || !s.LoggedIn || !s.HTTPSEnabled || s.Problem != nil || s.Hostname == "" {
			t.Fatal(s, e)
		}
		check, e := a.CheckHTTPSCertificate()
		if e != nil || !check.Ready || check.Problem != nil {
			t.Fatal(check, e)
		}
		url, e := a.Expose(8080)
		if e != nil || url != "https://"+s.Hostname+":8080" {
			t.Fatal(url, e)
		}
	})
	for _, kind := range []string{"not-installed", "not-running", "logged-out", "https-disabled", "unreadable"} {
		t.Run(kind, func(t *testing.T) {
			a := factory(kind)
			s, e := a.Status()
			if e != nil || s.Ready || s.Problem == nil || s.Problem.Kind != kind || s.Problem.Message == "" {
				t.Fatal(s, e)
			}
			check, e := a.CheckHTTPSCertificate()
			if e != nil || check.Ready || check.Problem == nil || *check.Problem != *s.Problem {
				t.Fatal(check, e)
			}
			_, e = a.Expose(8080)
			if e == nil || e.Error() != s.Problem.Message {
				t.Fatal(e)
			}
		})
	}
	t.Run("occupied address", func(t *testing.T) {
		_, e := factory("address-taken").Expose(8080)
		if !errors.Is(e, errors.Conflict) {
			t.Fatal(e)
		}
	})
	t.Run("publication failure", func(t *testing.T) {
		if _, e := factory("publish-failed").Expose(8080); e == nil {
			t.Fatal("expected failure")
		}
	})
	t.Run("invalid ports", func(t *testing.T) {
		for _, p := range []int{0, -1, 65536} {
			if _, e := factory("ready").Expose(p); e == nil {
				t.Fatal(p)
			}
		}
	})
}
