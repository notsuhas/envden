package enginetest

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"
)

func TestDashboardRenameInputs(t *testing.T) {
	for _, tc := range []struct {
		name string
		body any
	}{
		{"an empty body", json.RawMessage("null")}, {"an empty name", map[string]any{"name": ""}},
		{"a huge name", map[string]any{"name": strings.Repeat("x", 300)}}, {"an extra field", map[string]any{"name": "laptop", "device": "second"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			c := dashboardClient{f: f}
			r := c.send(f.first, "/api/devices/rename", nil, tc.body)
			equal(t, r.Code, 400)
			equal(t, c.object(r)["error"], any("INVALID_INPUT"))
		})
	}
}

func TestDashboardDeviceRename(t *testing.T) {
	f := newFixture(t)
	c := dashboardClient{f: f}

	for _, tc := range []struct{ name, message string }{{"second", "name"}, {"bad\u200bname", "invisible"}} {
		r := c.send(f.first, "/api/devices/rename", nil, map[string]any{"name": tc.name})
		equal(t, r.Code, 400)

		if !strings.Contains(c.object(r)["message"].(string), tc.message) {
			t.Fatal(r.Body.String())
		}
	}

	for _, tc := range []struct{ name, kind string }{{"first", "unchanged"}, {"laptop", "renamed"}} {
		r := c.send(f.first, "/api/devices/rename", nil, map[string]any{"name": tc.name})
		equal(t, r.Code, 200)
		result := c.object(r)
		equal(t, len(result), 1)
		equal(t, result["kind"], any(tc.kind))
	}

	status := c.get(f.first, "/api/status")
	equal(t, object(status["overview"])["deviceName"], any("laptop"))
	r := c.send(f.first, "/api/devices", nil, nil)
	equal(t, r.Code, 200)
	var ds []map[string]any
	must(t, json.Unmarshal(r.Body.Bytes(), &ds))
	names := []string{}
	own := ""

	for _, d := range ds {
		names = append(names, d["name"].(string))

		if d["current"] == true {
			own = d["name"].(string)
		}
	}

	sort.Strings(names)
	equal(t, strings.Join(names, ","), "laptop,second,third")
	equal(t, own, "laptop")
}
