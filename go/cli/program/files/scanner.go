package files

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/discovery"
	"github.com/notsuhas/envden/go/cli/links/place"
	"github.com/notsuhas/envden/go/cli/links/takeover"
	"github.com/notsuhas/envden/go/cli/onboarding/checkouts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	scanrender "github.com/notsuhas/envden/go/cli/output/render/scan"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/lib/clack"
)

func WorkspaceScanner(interactive bool, terminal *clack.Terminal, stdout, stderr io.Writer) TrackScanner {
	return func(ctx context.Context, a contracts.Adapters, state *model.State, o TrackOptions) error {
		repos, err := links.VaultRepos(ctx, a, state, o.Now)
		if err != nil {
			return err
		}

		home := output.RealHome(a.UserHome)
		own := []links.OwnLink{}
		report := func(message string) { _, _ = fmt.Fprintln(stderr, message) }
		ask := func(message string) (bool, error) {
			initial := false
			yes, err := terminal.Confirm(clack.PromptOptions{Message: output.SanitizeTerminal(message), InitialBool: &initial})

			return yes, cancelled(err)
		}
		shownRoots := []string{}
		for _, root := range o.ScanRoot {
			shownRoots = append(shownRoots, scanShellPath(root, home))
		}

		command := "envden track " + strings.Join(shownRoots, " ")
		dependencies := checkouts.Dependencies{
			Find: func(state *model.State) ([]checkouts.Eligible, error) {
				skips := []discovery.RepoSkip{}
				var spinner *clack.Spinner
				if interactive {
					spinner = terminal.Spinner()
					shown := []string{}
					for _, p := range o.ScanRoot {
						shown = append(shown, output.HomePath(output.RealHome(p), home))
					}

					spinner.Start("Looking for repos in " + strings.Join(shown, ", ") + " … 0 found")
				}

				found, err := discovery.DiscoverRepos(a.Repo, discovery.DiscoveryScope{Roots: o.ScanRoot, Home: a.UserHome}, discovery.DiscoveryEvents{Report: func(skip discovery.RepoSkip) { skips = append(skips, skip) }})
				if err != nil {
					if spinner != nil {
						spinner.Clear()
					}

					return nil, err
				}

				eligible, err := discovery.EligibleCheckouts(a, state, found, repos)
				if err != nil {
					if spinner != nil {
						spinner.Clear()
					}

					return nil, err
				}

				if spinner != nil {
					noun := "repos"
					if len(eligible) == 1 {
						noun = "repo"
					}

					spinner.Stop(fmt.Sprintf("Found %d %s with env files", len(eligible), noun))
				}

				counts := scanrender.SkipCounts{}
				for _, skip := range skips {
					if o.Verbose {
						report(output.SanitizeTerminal(output.HomePath(skip.Path, home) + ": skipped: " + skip.Reason))
					}

					if skip.Kind == "remote" {
						counts.Remote++
					} else {
						counts.Identity++
					}
				}

				if !o.Verbose {
					if line := scanrender.SkippedSummary(counts, command); line != "" {
						report(line)
					}
				}

				result := []checkouts.Eligible{}
				for _, item := range eligible {
					result = append(result, checkouts.Eligible{Checkout: item.Checkout, Files: item.Files})
				}

				return result, nil
			},
			AutoApprove: func(state *model.State, item adapters.Checkout) (bool, error) {
				return checkout.AutoApprovedWorktree(a, state, item)
			},
			Label: func(state *model.State, item checkouts.Eligible) string {
				return links.CheckoutLabel(state, item.Checkout, item.Files, home)
			},
			Link: func(ctx context.Context, state *model.State, item adapters.Checkout) error {
				if err := links.OfferForkAlias(state, item, repos, func(source, target string) (bool, error) {
					return ask(source + " looks like a fork of " + target + ". Share its env files with " + target + "?")
				}); err != nil {
					return err
				}

				if err := store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
					return err
				}

				choose := func(path string) (string, error) {
					return prompts.ChooseVersion(interactive, terminal, path)
				}
				values, err := place.LinkCheckout(ctx, a, state, item, place.LinkOptions{Copy: o.Copy, Interactive: interactive, Approve: func(adapters.Checkout) (bool, error) { return true, nil }, Ask: ask, Choose: choose, Report: report})
				own = append(own, values...)

				return err
			},
			Finish: func(ctx context.Context, state *model.State) error {
				confirm := func(message string) (bool, error) {
					initial := true
					yes, err := terminal.Confirm(clack.PromptOptions{Message: output.SanitizeTerminal(message), InitialBool: &initial})

					return yes, cancelled(err)
				}
				if !interactive {
					confirm = func(string) (bool, error) { return false, nil }
				}

				left, err := takeover.OfferTakeover(ctx, a, state, own, o.Copy, confirm, report)
				if err != nil {
					return err
				}

				if o.Verbose {
					for _, link := range left {
						report("envden: skipped " + output.SanitizeTerminal(output.HomePath(filepath.Join(link.Checkout.Root, link.Path), home)) + ": it links to " + output.SanitizeTerminal(link.Link) + ", and envden only syncs files it owns")
					}
				} else if line := scanrender.SkippedSummary(scanrender.SkipCounts{OwnLinks: len(left)}, command); line != "" {
					report(line)
				}

				return nil
			},
		}

		return cancelled(checkouts.Setup(ctx, a, state, interactive, terminal, stdout, dependencies))
	}
}

func cancelled(err error) error {
	if clack.IsCancel(err) {
		return state.PromptCancelled()
	}

	return err
}

func scanShellPath(path, home string) string {
	absolute, _ := filepath.Abs(path)
	relative, err := filepath.Rel(home, absolute)
	quote := func(value string) string {
		if regexp.MustCompile(`^[\w@%+=:,./-]+$`).MatchString(value) {
			return value
		}

		return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
	}
	if err != nil || strings.HasPrefix(relative, "..") {
		return quote(absolute)
	}

	if relative == "." {
		return "~"
	}

	return "~/" + quote(filepath.ToSlash(relative))
}
