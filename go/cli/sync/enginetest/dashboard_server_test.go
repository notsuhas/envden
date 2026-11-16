package enginetest

import (
	"strings"
	"testing"

	state "github.com/notsuhas/envden/go/cli/state/model"
)

func TestDashboardServerSyncFlows(t *testing.T) {
	f := newFixture(t)
	c := dashboardClient{f: f}

	for _, tc := range []struct {
		name, path string
		headers    map[string]string
		body       any
		status     int
	}{
		{"missing token", "/api/status", map[string]string{"Authorization": ""}, nil, 401},
		{"wrong token", "/api/status", map[string]string{"Authorization": "Bearer nope"}, nil, 401},
		{"rebound host", "/api/status", map[string]string{"Host": "evil.example:4100"}, nil, 421},
		{"rebound host on the page", "/", map[string]string{"Host": "evil.example:4100"}, nil, 421},
		{"cross-origin post", "/api/push", map[string]string{"Origin": "http://evil.example"}, map[string]any{}, 403},
		{"post without origin", "/api/pull", map[string]string{"Origin": ""}, map[string]any{}, 403},
		{"rename without a token", "/api/devices/rename", map[string]string{"Authorization": ""}, map[string]any{"name": "x"}, 401},
		{"cross-origin rename", "/api/devices/rename", map[string]string{"Origin": "http://evil.example"}, map[string]any{"name": "x"}, 403},
		{"history without a token", "/api/history?root=/x&path=.env", map[string]string{"Authorization": ""}, nil, 401},
		{"cross-origin restore", "/api/history/restore", map[string]string{"Origin": "http://evil.example"}, map[string]any{"root": "/x", "path": ".env", "version": 1}, 403},
		{"restore without origin", "/api/history/restore", map[string]string{"Origin": ""}, map[string]any{"root": "/x", "path": ".env", "version": 1}, 403},
		{"unknown path", "/nope", nil, nil, 404},
	} {
		t.Run(tc.name+" is refused", func(t *testing.T) {
			r := c.send(f.first, tc.path, tc.headers, tc.body)
			equal(t, r.Code, tc.status)

			if !strings.Contains(r.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
				t.Fatal("missing CSP")
			}

			equal(t, r.Header().Get("X-Content-Type-Options"), "nosniff")
			equal(t, r.Header().Get("Access-Control-Allow-Origin"), "")
		})
	}

	t.Run("the page is served with strict headers and no token", func(t *testing.T) {
		r := c.send(f.first, "/", map[string]string{"Authorization": ""}, nil)
		equal(t, r.Code, 200)
		equal(t, r.Body.String(), "<p>page</p>")

		if !strings.Contains(r.Header().Get("Content-Security-Policy"), "script-src 'self'") {
			t.Fatal("missing script CSP")
		}

		equal(t, r.Header().Get("Referrer-Policy"), "no-referrer")
	})
	t.Run("status names changed keys never values", func(t *testing.T) {
		f.write(f.aStore, original+"NEW=mine-only-secret\n")
		r := c.send(f.first, "/api/status", nil, nil)
		equal(t, r.Code, 200)
		equal(t, r.Header().Get("Cache-Control"), "no-store")
		status := c.object(r)
		overview := object(status["overview"])
		equal(t, overview["deviceName"], any("first"))
		equal(t, overview["pending"], any(float64(1)))
		equal(t, overview["checkedAt"], any(float64(clock())))
		unlock := object(overview["unlock"])
		equal(t, unlock["kind"], any("until"))
		equal(t, unlock["until"], any(float64(clock()+2592000000)))
		equal(t, object(array(status["repos"])[0])["repoId"], any(f.checkout.RepoID))
		file := dashboardFile(status)
		equal(t, file["path"], any(".env"))
		equal(t, file["status"], any("local-changes"))
		keys := object(file["keys"])
		equal(t, keys["kind"], any("diff"))
		equal(t, len(array(keys["added"])), 1)
		equal(t, array(keys["added"])[0], any("NEW"))
		equal(t, len(array(keys["removed"])), 0)
		equal(t, len(array(keys["changed"])), 0)
	})
	t.Run("recorded unlock expiry appears once server agrees", func(t *testing.T) {
		s := f.state(f.third)
		until := float64(clock()) + 86400000
		s.Session = &state.Window{UnlockedUntil: &until, FreshUntil: float64(clock())}
		f.save(f.third, s)
		unlock := object(object(c.get(f.third, "/api/status")["overview"])["unlock"])
		equal(t, unlock["kind"], any("until"))
		equal(t, unlock["until"], any(float64(until)))
		equal(t, len(unlock), 2)
	})
	t.Run("push and pull call through", func(t *testing.T) { dashboardPushPull(t, f, &c) })
	t.Run("conflicts resolve through dashboard", func(t *testing.T) { dashboardConflict(t, f, &c) })
	t.Run("no response carried an env value", func(t *testing.T) {
		if len(c.bodies) <= 15 {
			t.Fatal("missing response coverage")
		}

		c.noValues("local-test-value", "server-only-secret", "mine-only-secret")
	})
}
