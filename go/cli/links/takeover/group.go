package takeover

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/links/model"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
	"path/filepath"
	"sort"
	"strings"
)

func GroupOwnLinks(links []model.OwnLink) []model.OwnLinkGroup {
	groups := []model.OwnLinkGroup{}
	for _, l := range links {
		index := -1
		for i, g := range groups {
			if g.Target == l.Target {
				index = i
				break
			}
		}
		if index < 0 {
			groups = append(groups, model.OwnLinkGroup{Target: l.Target, Links: []model.OwnLink{}})
			index = len(groups) - 1
		}
		groups[index].Links = append(groups[index].Links, l)
	}
	c := collate.New(language.English)
	sort.SliceStable(groups, func(i, j int) bool { return c.CompareString(groups[i].Target, groups[j].Target) < 0 })
	for i := range groups {
		sort.SliceStable(groups[i].Links, func(a, b int) bool {
			x, y := groups[i].Links[a], groups[i].Links[b]
			wx := x.Checkout.RegisteredWorktree != nil && *x.Checkout.RegisteredWorktree
			wy := y.Checkout.RegisteredWorktree != nil && *y.Checkout.RegisteredWorktree
			if wx != wy {
				return !wx
			}
			return c.CompareString(filepath.Join(x.Checkout.Root, x.Path), filepath.Join(y.Checkout.Root, y.Path)) < 0
		})
	}
	return groups
}

func homePath(path, home string) string {
	if path == home {
		return "~"
	}
	if strings.HasPrefix(path, home+string(filepath.Separator)) {
		return "~" + strings.TrimPrefix(path, home)
	}
	return path
}

func TakeoverQuestion(group model.OwnLinkGroup, home string) string {
	if len(group.Links) == 0 {
		return ""
	}
	first := homePath(filepath.Join(group.Links[0].Checkout.Root, group.Links[0].Path), home)
	who := first + " links"
	subject, object := "The checkout", "it"
	if others := len(group.Links) - 1; others > 0 {
		noun := "others"
		if others == 1 {
			noun = "other"
		}
		who = fmt.Sprintf("%s and %d %s link", first, others, noun)
		subject, object = "Each checkout", "them"
	}
	return fmt.Sprintf("%s to %s. Let envden manage it? %s will use envden's synced copy instead of that file, and later edits to the file won't reach %s.", who, homePath(group.Target, home), subject, object)
}
