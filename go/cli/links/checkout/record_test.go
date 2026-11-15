package checkout

import (
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/core/adapters"
	"testing"
)

func TestApprovalRecordMatchesGitCheckoutJSON(t *testing.T) {
	identity := "fixture"
	device := int64(3)
	registered := false
	record := ApprovalRecord(adapters.Checkout{Root: "/repo", RepoID: "example/repo", GitDir: "/repo/.git", Identity: &identity, RootDevice: &device, RegisteredWorktree: &registered})
	raw, err := jsonvalue.Marshal(record)
	want := `{"identity":"fixture","rootDevice":3,"root":"/repo","repoId":"example/repo","gitDir":"/repo/.git","registeredWorktree":false}`
	if err != nil || string(raw) != want {
		t.Fatal(string(raw), err)
	}
	upstream := "host/upstream"
	item := adapters.Checkout{Root: "/repo", RepoID: "fork", GitDir: "/repo/.git", UpstreamRepoID: &upstream}
	raw, err = jsonvalue.Marshal(ApprovalRecord(item))
	if err != nil || string(raw) != `{"upstreamRepoId":"host/upstream","root":"/repo","repoId":"fork","gitDir":"/repo/.git"}` {
		t.Fatal(string(raw), err)
	}
}
