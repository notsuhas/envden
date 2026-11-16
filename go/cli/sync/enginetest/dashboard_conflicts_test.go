package enginetest

import (
	"strings"
	"testing"
)

func dashboardConflict(t *testing.T, f *fixture, c *dashboardClient) {
	store := f.state(f.second).Links[0].Store
	f.pull(f.first)
	f.write(f.aStore, original+"A=server-only-secret\n")
	f.write(store, original+"A=mine-only-secret\n")
	r := c.send(f.first, "/api/push", nil, map[string]any{})
	equal(t, r.Code, 200)
	r = c.send(f.second, "/api/pull", nil, map[string]any{})
	equal(t, r.Code, 200)
	equal(t, c.object(r)["conflicts"], any(float64(1)))
	status := c.get(f.second, "/api/status")
	conflicts := array(status["conflicts"])
	equal(t, len(conflicts), 1)
	record := object(conflicts[0])
	id := record["id"].(string)
	file := dashboardFile(status)
	equal(t, file["status"], any("conflict"))
	equal(t, file["held"], any("conflict"))
	equal(t, file["conflictId"], any(id))
	keys := object(record["keys"])
	equal(t, keys["kind"], any("diff"))
	equal(t, len(array(keys["added"])), 0)
	equal(t, len(array(keys["removed"])), 0)
	equal(t, len(array(keys["changed"])), 1)
	equal(t, array(keys["changed"])[0], any("A"))
	r = c.send(f.second, "/api/resolve", nil, map[string]any{"id": id, "choice": "edit"})
	equal(t, r.Code, 400)
	r = c.send(f.second, "/api/resolve", nil, map[string]any{"id": id, "choice": "take-server"})
	equal(t, r.Code, 200)
	resolved := c.object(r)
	equal(t, resolved["kind"], any("resolved"))
	equal(t, resolved["path"], any(".env"))

	if !strings.Contains(f.read(store), "A=server-only-secret") {
		t.Fatal("missing resolved server bytes")
	}

	equal(t, len(array(c.get(f.second, "/api/status")["conflicts"])), 0)
}
