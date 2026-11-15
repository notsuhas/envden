package recovery_test

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/admin/repair/finish"
	"github.com/notsuhas/envden/go/cli/client"
	serverrepair "github.com/notsuhas/envden/go/server/repair"
	"github.com/notsuhas/envden/go/server/shared"
)

func TestRepairUploadsAndDrop(t *testing.T) {
	for _, drop := range []bool{false, true} {
		t.Run(map[bool]string{false: "all reports", true: "without device"}[drop], func(t *testing.T) {
			f := newFixture(t, true)
			greeting, err := client.Hello(f.ctx, f.address, nil, f.a.Fetcher, "")
			if err != nil {
				t.Fatal(err)
			}

			restored, err := serverrepair.StartRestored(shared.Options{Storage: f.server.Storage, Now: f.now, ServerKeys: shared.Keys{PublicKey: greeting.Hello.ServerSignPub}})
			if err != nil || len(restored) != 1 {
				t.Fatal(restored, err)
			}

			token := restored[0].Token
			if _, err = repair.UploadRepair(f.ctx, f.a, token, f.now, f.a.Fetcher); err != nil {
				t.Fatal(err)
			}

			result, err := finish.FinishRepair(f.ctx, f.a, finish.Options{Token: token, Password: "old password", Now: f.now, Fetcher: f.a.Fetcher})
			if err != nil || result.Kind != "missing-reports" || len(result.Devices) != 1 || result.Devices[0] != "second" {
				t.Fatal(result, err)
			}

			options := finish.Options{Token: token, Password: "old password", Now: f.now, Fetcher: f.a.Fetcher}
			if drop {
				options.Without = []string{"second"}
				options.AcceptLost = true
			} else {
				if _, err = repair.UploadRepair(f.ctx, f.b, token, f.now, f.b.Fetcher); err != nil {
					t.Fatal(err)
				}
			}

			result, err = finish.FinishRepair(f.ctx, f.a, options)
			if err != nil || result.Kind != "finished" {
				t.Fatal(result, err)
			}
		})
	}
}
