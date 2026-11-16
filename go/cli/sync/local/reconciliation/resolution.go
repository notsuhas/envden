package reconciliation

import (
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/merge"
)

func ResolveContent(options syncmodel.Options, path string, mine, server, previous []byte, choose func(string) (string, error), defaultContent []byte) (Action, error) {
	if options.NonInteractive() && choose != nil {
		return Action{Kind: "conflict"}, nil
	}

	choice := "merge"
	var err error

	if choose != nil {
		choice, err = choose(path)
		if err != nil {
			return Action{}, err
		}
	}

	if choice == "keep-mine" {
		return Action{Kind: "write", Next: mine}, nil
	}

	if choice == "take-server" {
		return Action{Kind: "write", Next: defaultContent}, nil
	}

	if mine == nil || server == nil || previous == nil {
		return Action{Kind: "conflict"}, nil
	}

	merged := merge.MergeEnv(previous, mine, server)

	if merged.Kind == "clean" && options.Report != nil {
		options.Report(output.SanitizeTerminal("Merge " + path + ": " + strings.Join(merged.ChangedKeys, ", ")))
	}

	if merged.Kind != "clean" {
		return Action{Kind: "conflict"}, nil
	}

	if !options.Yes {
		if options.NonInteractive() || options.Confirm == nil {
			return Action{Kind: "conflict"}, nil
		}

		confirmed, err := options.Confirm(merged.ChangedKeys)
		if err != nil {
			return Action{}, err
		}

		if !confirmed {
			return Action{Kind: "conflict"}, nil
		}
	}

	if options.Report != nil {
		options.Report(output.SanitizeTerminal("Merged " + path + ": " + strings.Join(merged.ChangedKeys, ", ")))
	}

	return Action{Kind: "write", Next: merged.Bytes}, nil
}
