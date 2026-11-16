package enginetest

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/contracts"
	dashboardactions "github.com/notsuhas/envden/go/cli/ui/actions"
	dashboard "github.com/notsuhas/envden/go/cli/ui/server"
	"github.com/notsuhas/envden/go/cli/ui/server/assets"
	"net/http"
	"net/http/httptest"
	"strings"
)

type dashboardClient struct {
	f      *fixture
	bodies []string
}

func (c *dashboardClient) app(a contracts.Adapters) http.Handler {
	actions := dashboardactions.CreateDashboardActions(a, clock)
	return dashboard.CreateDashboardApp(dashboard.Dashboard{Token: "test-token", Port: 4100, Assets: map[string]assets.PageAsset{"/": {Body: []byte("<p>page</p>"), Type: "text/html"}}, Actions: actions})
}
func (c *dashboardClient) send(a contracts.Adapters, path string, headers map[string]string, body any) *httptest.ResponseRecorder {
	c.f.t.Helper()
	method := "GET"
	raw := ""
	if body != nil {
		method = "POST"
		data, err := json.Marshal(body)
		must(c.f.t, err)
		raw = string(data)
	}
	req := httptest.NewRequest(method, "http://127.0.0.1:4100"+path, strings.NewReader(raw))
	req.Host = "127.0.0.1:4100"
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Origin", "http://127.0.0.1:4100")
	for k, v := range headers {
		if k == "Host" {
			req.Host = v
		} else {
			req.Header.Set(k, v)
		}
	}
	response := httptest.NewRecorder()
	c.app(a).ServeHTTP(response, req)
	c.bodies = append(c.bodies, response.Body.String())
	return response
}
func (c *dashboardClient) object(response *httptest.ResponseRecorder) map[string]any {
	c.f.t.Helper()
	result := map[string]any{}
	must(c.f.t, json.Unmarshal(response.Body.Bytes(), &result))
	return result
}
func (c *dashboardClient) get(a contracts.Adapters, path string) map[string]any {
	r := c.send(a, path, nil, nil)
	equal(c.f.t, r.Code, 200)
	return c.object(r)
}
func object(v any) map[string]any { return v.(map[string]any) }
func array(v any) []any           { return v.([]any) }
func dashboardFile(status map[string]any) map[string]any {
	return object(array(object(array(object(array(status["repos"])[0])["checkouts"])[0])["files"])[0])
}
func (c *dashboardClient) noValues(secrets ...string) {
	for _, body := range c.bodies {
		for _, secret := range secrets {
			if strings.Contains(body, secret) {
				c.f.t.Fatal("dashboard leaked env value")
			}
		}
	}
}
