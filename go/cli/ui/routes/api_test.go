package routes

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/notsuhas/envden/go/cli/ui/routes/inputs"
)

func TestHeadAPI(t *testing.T) {
	_, found, err := API(httptest.NewRequest("HEAD", "http://localhost/api/status", nil), Actions{Status: func(context.Context, inputs.Input) (any, error) { return true, nil }})
	if !found || err != nil {
		t.Fatal(found, err)
	}
}

func TestHistoryQueryKeepsSemicolon(t *testing.T) {
	called := false
	_, found, err := API(httptest.NewRequest("GET", "http://localhost/api/history?root=/repo&path=a;b", nil), Actions{History: func(_ context.Context, v inputs.Input) (any, error) {
		called = true
		if v.Path != "a;b" {
			t.Fatal(v)
		}
		return true, nil
	}})
	if !called || !found || err != nil {
		t.Fatal(called, found, err)
	}
}
