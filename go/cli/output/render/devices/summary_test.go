package devices

import (
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/state/model"
)

func TestSummaries(t *testing.T) {
	s := model.EmptyState("laptop")
	if got := SetupSummary(s, "/home/me"); len(got) != 2 || got[1] != "Track a checkout with: envden track <path>" {
		t.Fatal(got)
	}

	s.Links = []model.Link{{Root: "/home/me/app", Path: ".env"}, {Root: "/local", Path: ".env", LocalOnly: true}}
	if got := JoinSummary(s, "/home/me"); got[0] != "Joined as laptop. Synced 1 env file in ~/app." {
		t.Fatal(got)
	}

	kit := KitText(Kit{"vault", "secret", "server"})
	if !strings.Contains(kit, "  Vault ID:    vault") || !strings.Contains(kit, "  Secret key:  secret") {
		t.Fatal(kit)
	}
}
