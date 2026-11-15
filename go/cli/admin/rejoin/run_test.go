package rejoin

import (
	"context"
	"reflect"
	"testing"
)

func TestRunRejoin(t *testing.T) {
	for _, options := range []Options{{}, {Recovery: true}, {RecoveryKit: "kit.json"}} {
		steps := []string{}
		join := func(name string) func(context.Context, bool) error {
			return func(_ context.Context, rejoin bool) error {
				if !rejoin {
					t.Fatal("missing rejoin flag")
				}

				steps = append(steps, name)

				return nil
			}
		}
		err := RunRejoin(context.Background(), options, Actions{Recovery: join("kit"), Pairing: join("pair"), Complete: func(context.Context) error { steps = append(steps, "complete"); return nil }})
		want := "pair"
		if options.Recovery || options.RecoveryKit != "" {
			want = "kit"
		}

		if err != nil || !reflect.DeepEqual(steps, []string{want, "complete"}) {
			t.Fatal(steps, err)
		}
	}
}
