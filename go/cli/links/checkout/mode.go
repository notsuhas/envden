package checkout

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/core/adapters"
	"os"
	"regexp"
)

func CheckoutPlacement(ctx context.Context, a contracts.Adapters, root string, copy bool, ask func(string) (bool, error), interactive bool) (adapters.PlacementMode, error) {
	config, err := settings.ReadConfig(a.Home)
	if err != nil {
		return "", err
	}
	modes := jsonvalue.Object{}
	if config.Placement != nil {
		modes = append(modes, (*config.Placement)...)
	}
	set := func(mode string) (adapters.PlacementMode, error) {
		modes.Set(root, mode)
		raw, err := jsonvalue.Marshal(modes)
		if err != nil {
			return "", err
		}
		_, err = settings.SetConfig(ctx, "placement", string(raw), a.Home, a.Timing, interactive)
		return adapters.PlacementMode(mode), err
	}
	if copy {
		return set("copy")
	}
	for _, f := range modes {
		if f.Key == root {
			return adapters.PlacementMode(f.Value.(string)), nil
		}
	}
	if interactive {
		entries, err := os.ReadDir(root)
		if err != nil {
			return "", err
		}
		if HasContainerFiles(entries) && ask != nil {
			yes, err := ask("Container configuration detected. Use copy mode for this checkout?")
			if err != nil {
				return "", err
			}
			if yes {
				return set("copy")
			}
			return set("link")
		}
	}
	return adapters.PlacementLink, nil
}

func HasContainerFiles(entries []os.DirEntry) bool {
	for _, e := range entries {
		if e.Name() == ".devcontainer" && e.IsDir() || e.Type().IsRegular() && (e.Name() == "Dockerfile" || regexp.MustCompile(`^docker-compose.*\.yml$`).MatchString(e.Name())) {
			return true
		}
	}
	return false
}
