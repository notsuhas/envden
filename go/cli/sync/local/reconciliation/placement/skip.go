package placement

import "github.com/notsuhas/envden/go/cli/state/model"

func TargetSkip(links []model.Link, target model.Link, approved bool) string {
	if !approved {
		return "unapproved"
	}
	for _, current := range links {
		if current.Root != target.Root || current.Path != target.Path {
			continue
		}
		if current.LocalOnly {
			return "local-only"
		}
		if current.Mode != target.Mode || current.Store != target.Store {
			return "changed"
		}
		break
	}

	return ""
}
