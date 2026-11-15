package view

import (
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
	"sort"
)

type FileRow struct {
	RepoID, Root, Approval string
	File                   FileView
}

func GroupRepos(rows []FileRow) []RepoView {
	repos := []RepoView{}
	for _, row := range rows {
		ri := -1
		for i, r := range repos {
			if r.RepoID == row.RepoID {
				ri = i
				break
			}
		}
		if ri < 0 {
			repos = append(repos, RepoView{row.RepoID, row.File.Status, []CheckoutView{}})
			ri = len(repos) - 1
		}
		repo := &repos[ri]
		ci := -1
		for i, c := range repo.Checkouts {
			if c.Root == row.Root {
				ci = i
				break
			}
		}
		if ci < 0 {
			repo.Checkouts = append(repo.Checkouts, CheckoutView{row.Root, row.Approval, []FileView{}})
			ci = len(repo.Checkouts) - 1
		}
		repo.Checkouts[ci].Files = append(repo.Checkouts[ci].Files, row.File)
		repo.Status = MostUrgent([]string{repo.Status, row.File.Status})
	}
	c := collate.New(language.English)
	sort.SliceStable(repos, func(i, j int) bool { return c.CompareString(repos[i].RepoID, repos[j].RepoID) < 0 })
	return repos
}
