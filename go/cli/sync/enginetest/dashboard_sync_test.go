package enginetest

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"
)

func TestDashboardPushPullCallThrough(t *testing.T) {
	f := newFixture(t)
	c := dashboardClient{f: f}
	f.write(f.aStore, original+"NEW=mine-only-secret\n")
	dashboardPushPull(t, f, &c)
}
func dashboardPushPull(t *testing.T, f *fixture, c *dashboardClient) {
	r := c.send(f.first, "/api/push", nil, map[string]any{})
	equal(t, r.Code, 200)
	pushed := c.object(r)
	equal(t, pushed["kind"], any("pushed"))
	equal(t, pushed["conflicts"], any(float64(0)))
	if pushed["changed"].(float64) <= 0 {
		t.Fatal(pushed)
	}
	status := c.get(f.first, "/api/status")
	equal(t, object(status["overview"])["pending"], any(float64(0)))
	file := dashboardFile(status)
	raw, err := json.Marshal(file)
	must(t, err)
	equal(t, string(raw), "{\"mode\":\"link\",\"path\":\".env\",\"status\":\"in-sync\"}")
	r = c.send(f.second, "/api/pull", nil, map[string]any{})
	equal(t, r.Code, 200)
	pulled := c.object(r)
	equal(t, pulled["kind"], any("pulled"))
	equal(t, pulled["conflicts"], any(float64(0)))
	listed := c.send(f.second, "/api/devices", nil, nil)
	equal(t, listed.Code, 200)
	var devices []map[string]any
	must(t, json.Unmarshal(listed.Body.Bytes(), &devices))
	names := []string{}
	current := ""
	for _, d := range devices {
		names = append(names, d["name"].(string))
		if d["current"] == true {
			current = d["name"].(string)
		}
	}
	sort.Strings(names)
	equal(t, strings.Join(names, ","), "first,second,third")
	equal(t, current, "second")
	c.noValues("local-test-value", "mine-only-secret", "server-only-secret")
}
