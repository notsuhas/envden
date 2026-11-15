package access

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/discovery"
	"github.com/notsuhas/envden/go/cli/links/place"
	"github.com/notsuhas/envden/go/cli/links/takeover"
	"github.com/notsuhas/envden/go/cli/onboarding"
	"github.com/notsuhas/envden/go/cli/onboarding/checkouts"
	"github.com/notsuhas/envden/go/cli/output"
	scanrender "github.com/notsuhas/envden/go/cli/output/render/scan"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
)

func SetupCheckouts(ctx context.Context, a contracts.Adapters, state *model.State, o onboarding.SetupOptions, p onboarding.Prompts, stdout io.Writer) error {
	own := []links.OwnLink{}
	stored := map[string]bool{}
	command := checkouts.RescanCommand(o.Command, o.ScanRoot, o.ExcludeRoot, a.UserHome)
	ask := func(question string) (bool, error) { return p.Consent(question, false) }
	d := checkouts.Dependencies{
		Find: func(state *model.State) ([]checkouts.Eligible, error) {
			roots := o.ScanRoot
			if roots == nil {
				roots = []string{a.UserHome}
			}

			var progress interface{ Stop(string) }
			if p.Interactive {
				spinner := p.Terminal.Spinner()
				shown := []string{}
				for _, root := range roots {
					shown = append(shown, output.HomePath(output.RealHome(root), a.UserHome))
				}

				spinner.Start("Looking for repos in " + strings.Join(shown, ", ") + " … 0 found")
				progress = spinner
			}

			skips := []discovery.RepoSkip{}
			repos, err := discovery.DiscoverRepos(a.Repo, discovery.DiscoveryScope{Roots: roots, Excluded: o.ExcludeRoot, Home: a.UserHome}, discovery.DiscoveryEvents{Report: func(skip discovery.RepoSkip) { skips = append(skips, skip) }})
			if err != nil {
				return nil, err
			}

			config, err := settings.ReadConfig(a.Home)
			if err != nil {
				return nil, err
			}

			var rules *adapters.EnvFileRules
			if config.EnvFiles != nil {
				raw, err := json.Marshal(config.EnvFiles)
				if err != nil {
					return nil, err
				}

				rules = &adapters.EnvFileRules{}
				if err = json.Unmarshal(raw, rules); err != nil {
					return nil, err
				}
			}

			stored, err = vaultRepos(a, state)
			if err != nil {
				return nil, err
			}

			eligible := []checkouts.Eligible{}
			for _, item := range repos {
				files, err := a.Repo.EnvFiles(item, rules)
				if err != nil {
					return nil, err
				}

				id := checkout.RepoID(state, item.RepoID)
				if len(files) > 0 || stored[id] {
					eligible = append(eligible, checkouts.Eligible{Checkout: item, Files: files})
				}
			}

			if progress != nil {
				word := "repos"
				if len(eligible) == 1 {
					word = "repo"
				}

				progress.Stop(fmt.Sprintf("Found %d %s with env files", len(eligible), word))
			}

			counts := scanrender.SkipCounts{}
			for _, skip := range skips {
				if o.Verbose {
					_, _ = fmt.Fprintln(p.Stderr, scanrender.RepoSkipLine(skip.Path, skip.Reason, a.UserHome))
				} else if skip.Kind == "remote" {
					counts.Remote++
				} else {
					counts.Identity++
				}
			}

			if !o.Verbose {
				if summary := scanrender.SkippedSummary(counts, command); summary != "" {
					_, _ = fmt.Fprintln(p.Stderr, summary)
				}
			}

			return eligible, nil
		}, AutoApprove: func(state *model.State, item adapters.Checkout) (bool, error) {
			return checkout.AutoApprovedWorktree(a, state, item)
		},
		Label: func(state *model.State, item checkouts.Eligible) string {
			return links.CheckoutLabel(state, item.Checkout, item.Files, a.UserHome)
		},
		Link: func(ctx context.Context, state *model.State, item adapters.Checkout) error {
			if err := links.OfferForkAlias(state, item, stored, func(source, target string) (bool, error) {
				return ask(source + " looks like a fork of " + target + ". Share its env files with " + target + "?")
			}); err != nil {
				return err
			}

			if err := store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
				return err
			}

			found, err := place.LinkCheckout(ctx, a, state, item, place.LinkOptions{Interactive: p.Interactive, Approve: func(adapters.Checkout) (bool, error) { return true, nil }, Ask: ask, Report: func(line string) { _, _ = fmt.Fprintln(p.Stderr, line) }})
			own = append(own, found...)

			return err
		}, Finish: func(ctx context.Context, state *model.State) error {
			left, err := takeover.OfferTakeover(ctx, a, state, own, false, ask, func(line string) { _, _ = fmt.Fprintln(p.Stderr, line) })
			if err != nil {
				return err
			}

			if o.Verbose {
				for _, link := range left {
					_, _ = fmt.Fprintln(p.Stderr, scanrender.OwnLinkLine(link.Checkout.Root, link.Path, link.Link, a.UserHome))
				}
			} else if summary := scanrender.SkippedSummary(scanrender.SkipCounts{OwnLinks: len(left)}, command); summary != "" {
				_, _ = fmt.Fprintln(p.Stderr, summary)
			}

			return nil
		},
	}

	return checkouts.Setup(ctx, a, state, p.Interactive, p.Terminal, stdout, d)
}
