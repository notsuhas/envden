package reconciliation

import (
	"testing"

	sm "github.com/notsuhas/envden/go/cli/sync/model"
)

func TestContentResolution(t *testing.T) {
	previous, mine, server := []byte("A=1\nB=1\n"), []byte("A=2\nB=1\n"), []byte("A=1\nB=2\n")
	for _, choice := range []string{"keep-mine", "take-server"} {
		result, err := ResolveContent(sm.Options{}, ".env", mine, server, previous, func(string) (string, error) { return choice, nil }, server)
		want := mine
		if choice == "take-server" {
			want = server
		}
		if err != nil || result.Kind != "write" || !same(result.Next, want) {
			t.Fatal(result, err)
		}
	}
	for _, accepted := range []bool{false, true} {
		reports := []string{}
		result, err := ResolveContent(sm.Options{Confirm: func([]string) (bool, error) { return accepted, nil }, Report: func(v string) { reports = append(reports, v) }}, ".env", mine, server, previous, nil, nil)
		want := "conflict"
		count := 1
		if accepted {
			want = "write"
			count = 2
		}
		if err != nil || result.Kind != want || len(reports) != count {
			t.Fatal(result, reports, err)
		}
	}
	interactive := false
	result, err := ResolveContent(sm.Options{Interactive: &interactive, Confirm: func([]string) (bool, error) { t.Fatal("prompted"); return false, nil }}, ".env", mine, server, previous, func(string) (string, error) { t.Fatal("chose"); return "", nil }, nil)
	if err != nil || result.Kind != "conflict" {
		t.Fatal(result, err)
	}
	result, err = ResolveContent(sm.Options{Yes: true}, ".env", mine, server, nil, nil, nil)
	if err != nil || result.Kind != "conflict" {
		t.Fatal(result, err)
	}
}
