package discovery

import (
	"path/filepath"
	"sort"
	"sync"

	"github.com/notsuhas/envden/go/core/adapters"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

type DiscoveryScope struct {
	Roots, Excluded []string
	Home            string
}

type DiscoveryEvents struct {
	Report   func(RepoSkip)
	Progress func(int)
}

type walk struct {
	repo    adapters.Repo
	scope   DiscoveryScope
	events  DiscoveryEvents
	mu      sync.Mutex
	found   map[string]adapters.Checkout
	visited map[string]bool
	git     chan struct{}
	fs      chan struct{}
}

func DiscoverRepos(repo adapters.Repo, scope DiscoveryScope, events ...DiscoveryEvents) ([]adapters.Checkout, error) {
	scope.Excluded = append([]string(nil), scope.Excluded...)
	for i, p := range scope.Excluded {
		scope.Excluded[i] = realOrResolved(p)
	}

	if scope.Home != "" {
		scope.Home = realOrResolved(scope.Home)
	}

	w := &walk{repo: repo, scope: scope, found: map[string]adapters.Checkout{}, visited: map[string]bool{}, git: make(chan struct{}, 8), fs: make(chan struct{}, 32)}
	if len(events) > 0 {
		w.events = events[0]
	}

	parallel(scope.Roots, func(p string) { w.folder(p, true) })
	result := make([]adapters.Checkout, 0, len(w.found))
	for _, item := range w.found {
		result = append(result, item)
	}

	c := collate.New(language.English)
	sort.SliceStable(result, func(i, j int) bool { return c.CompareString(result[i].Root, result[j].Root) < 0 })

	return result, nil
}

func parallel(paths []string, fn func(string)) {
	var group sync.WaitGroup
	for _, path := range paths {
		group.Add(1)
		go func() { defer group.Done(); fn(path) }()
	}

	group.Wait()
}

func realOrResolved(path string) string {
	p, err := filepath.EvalSymlinks(path)
	if err != nil {
		p = path
	}

	p, _ = filepath.Abs(p)

	return p
}
