package settings

import (
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/state/files"
)

type Locations struct{ Home, Store, State, Base, Conflicts, Config string }

func Paths(home string) Locations {
	root, _ := filepath.Abs(home)

	return Locations{root, filepath.Join(root, "store"), filepath.Join(root, "state"), filepath.Join(root, "base"), filepath.Join(root, "conflicts"), filepath.Join(root, "config.json")}
}

func EnsurePaths(home string) (Locations, error) {
	p := Paths(home)
	for _, d := range []string{p.Home, p.Store, p.State, p.Base, p.Conflicts} {
		if err := files.PrivateDirectory(d); err != nil {
			return p, err
		}
	}

	return p, nil
}
