package access

import (
	"context"
	"fmt"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/notice"
	"github.com/notsuhas/envden/go/cli/onboarding"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/vault/initial"
	"github.com/notsuhas/envden/go/lib/clack"
)

func FirstRun(ctx context.Context, a contracts.Adapters, p onboarding.Prompts) error {
	interactive := true
	_, err := sync.FirstRun(ctx, a, sync.Options{Now: a.Now, Fetcher: a.Fetcher, All: true, Interactive: &interactive}, func(path string) (string, error) {
		return p.Terminal.Select(clack.PromptOptions{Message: path + " differs from the server's copy", Options: []clack.Option{{Value: "keep-mine", Label: "Keep mine"}, {Value: "take-server", Label: "Take the server's"}, {Value: "merge", Label: "Merge both"}}})
	})

	return err
}

func Initial(ctx context.Context, a contracts.Adapters, s *model.State, p onboarding.Prompts) error {
	return initial.PushInitialFiles(ctx, a, s, func(ctx context.Context) error { return initial.ResumeInitialFiles(ctx, a) }, func(line string) { _, _ = fmt.Fprintln(p.Stderr, line) })
}

func RefreshNotice(ctx context.Context, a contracts.Adapters, s *model.State) error {
	return notice.RefreshNotice(ctx, a.Home, s, func(root string) (bool, error) { return a.Repo.CaseInsensitive(root, true) }, a.Now, a.Timing)
}
