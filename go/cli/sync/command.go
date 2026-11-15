package sync

import (
	"context"
	"os"
	"strings"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/session"
)

func CommandOptions(a contracts.Adapters, values map[string]any, interactive bool, report func(string)) Options {
	cwd, _ := os.Getwd()

	return Options{Now: a.Now, Fetcher: a.Fetcher, Cwd: cwd, All: values["all"] == true, Yes: values["yes"] == true, Interactive: &interactive, Report: report,
		Confirm: func(keys []string) (bool, error) {
			return prompts.Consent("Merge changes to "+strings.Join(keys, ", ")+"?", false)
		},
		Unlock: func(ctx context.Context, cl *client.Client, id []byte) error {
			_, err := session.Login(ctx, cl, id, session.Password{Prompt: func(retry bool) (string, error) {
				message := "Master password"
				if retry {
					message = "Wrong master password. Try again"
				}

				return prompts.Secret(message)
			}}, "")

			return err
		},
		Choose: func(path string) (string, error) {
			return prompts.Choose("Detached file: "+path, []prompts.Option{{Value: "keep-mine", Label: "Keep mine"}, {Value: "take-server", Label: "Take server"}, {Value: "merge", Label: "Merge"}}, "")
		},
	}
}
