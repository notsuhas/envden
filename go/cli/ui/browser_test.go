package ui

import (
	"reflect"
	"testing"
)

func TestBrowserCommand(t *testing.T) {
	for _, row := range []struct {
		platform string
		want     []string
	}{{"darwin", []string{"open", "http://127.0.0.1:1/#token"}}, {"win32", []string{"rundll32", "url.dll,FileProtocolHandler", "http://127.0.0.1:1/#token"}}, {"linux", []string{"xdg-open", "http://127.0.0.1:1/#token"}}} {
		if got := BrowserCommand(row.platform, "http://127.0.0.1:1/#token"); !reflect.DeepEqual(got, row.want) {
			t.Fatal(got, row.want)
		}
	}
}
