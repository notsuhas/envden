package takeover

import (
	"github.com/notsuhas/envden/go/cli/links/model"
	"path/filepath"
	"slices"
)

func SiblingLink(own model.OwnLink, paths []string) bool {
	target := own.Link
	if !filepath.IsAbs(target) {
		target = filepath.Join(filepath.Dir(filepath.Join(own.Checkout.Root, own.Path)), target)
	}
	rel, err := filepath.Rel(own.Checkout.Root, target)
	return err == nil && slices.Contains(paths, filepath.ToSlash(rel))
}
