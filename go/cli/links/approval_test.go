package links

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func TestApprovalIdentityAndAlias(t *testing.T) {
	id := "original"
	changed := "changed"
	state := model.EmptyState("x")
	state.Approved = []model.Checkout{{Root: "/repo", RepoID: "fork", GitDir: "/repo/.git", Identity: &id}}
	item := adapters.Checkout{Root: "/repo", RepoID: "fork", GitDir: "/repo/.git", Identity: &id}
	if CheckoutApproval(state, item) != "approved" {
		t.Fatal("original rejected")
	}

	item.Identity = &changed
	if CheckoutApproval(state, item) != "ask" {
		t.Fatal("recreated identity approved")
	}

	item.Identity = &id
	item.RepoID = "upstream"
	if CheckoutApproval(state, item) != "changed" {
		t.Fatal("remote change accepted")
	}

	state.Aliases.Set("fork", "upstream")
	if CheckoutApproval(state, item) != "approved" {
		t.Fatal("alias rejected")
	}
}

func TestDeriveAlias(t *testing.T) {
	for _, row := range []struct {
		source, target string
		aliases        jsonvalue.Object
		want           string
	}{
		{"", "b", nil, "invalid"}, {"a", "", nil, "invalid"}, {"a", "a", nil, "invalid"}, {"a", "b", jsonvalue.Object{{Key: "b", Value: "c"}}, "chain"}, {"a", "b", jsonvalue.Object{{Key: "c", Value: "a"}}, "chain"}, {"a", "b", nil, "assign"},
		{"a", "b", jsonvalue.Object{{Key: "b", Value: ""}}, "chain"}, {"x", "constructor", nil, "assign"}, {"x", "hasOwnProperty", nil, "assign"}, {"x", "toString", nil, "assign"}, {"__proto__", "x", nil, "assign"},
	} {
		if got := DeriveAlias(row.aliases, row.source, row.target); got != row.want {
			t.Fatalf("%+v got %q", row, got)
		}
	}
}

func TestForkAlias(t *testing.T) {
	upstream := "upstream"
	item := adapters.Checkout{Root: "/fork", RepoID: "fork", UpstreamRepoID: &upstream}
	state := model.EmptyState("x")
	repos := map[string]bool{"upstream": true}
	if !ShouldAskAlias(state, item, repos) {
		t.Fatal("new fork not offered")
	}

	err := OfferForkAlias(state, item, repos, func(a, b string) (bool, error) { return false, nil })
	if err != nil {
		t.Fatal(err)
	}

	if ShouldAskAlias(state, item, repos) {
		t.Fatal("declined fork asked twice")
	}
}
