package discovery

import (
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/notsuhas/envden/go/core/adapters"
)

func (w *walk) unseen(path string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.visited[path] || w.excluded(path) {
		return false
	}

	w.visited[path] = true

	return true
}

func (w *walk) excluded(path string) bool {
	for _, ex := range w.scope.Excluded {
		rel, err := filepath.Rel(ex, path)
		if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return true
		}
	}

	return false
}

func (w *walk) folder(path string, root bool) {
	w.fs <- struct{}{}
	real, err := filepath.EvalSymlinks(path)
	<-w.fs
	if err != nil {
		return
	}

	real, _ = filepath.Abs(real)
	if !w.unseen(real) {
		return
	}

	w.fs <- struct{}{}
	entries, err := os.ReadDir(real)
	<-w.fs
	if err != nil {
		return
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}

	if contains(names, ".git") && w.collect(real) && !root {
		return
	}

	place := FolderPlace{real == w.scope.Home, ProjectFolder(names)}
	paths := []string{}
	for _, e := range entries {
		if (e.IsDir() || e.Type()&os.ModeSymlink != 0) && !SkippedFolder(e.Name(), place) {
			paths = append(paths, filepath.Join(real, e.Name()))
		}
	}

	parallel(paths, func(p string) { w.folder(p, false) })
}

func (w *walk) identify(path string) *adapters.Checkout {
	w.git <- struct{}{}
	item := Identify(w.repo, path, func(s RepoSkip) {
		w.mu.Lock()
		defer w.mu.Unlock()
		if w.events.Report != nil {
			w.events.Report(s)
		}
	})
	<-w.git

	return item
}

func (w *walk) add(item adapters.Checkout) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.found[item.Root] = item
	if w.events.Progress != nil {
		w.events.Progress(len(w.found))
	}
}

func (w *walk) collect(path string) bool {
	item := w.identify(path)
	if item == nil {
		return false
	}

	w.add(*item)
	var group sync.WaitGroup
	group.Add(2)
	go func() {
		defer group.Done()
		w.git <- struct{}{}
		paths, _ := w.repo.Worktrees(*item)
		<-w.git
		parallel(paths, func(p string) {
			w.mu.Lock()
			_, found := w.found[p]
			w.mu.Unlock()
			if !found && !w.excluded(p) {
				if next := w.identify(p); next != nil {
					w.add(*next)
				}
			}
		})
	}()
	go func() {
		defer group.Done()
		w.git <- struct{}{}
		paths, _ := w.repo.Submodules(*item)
		<-w.git
		parallel(paths, func(p string) {
			path := filepath.Join(item.Root, p)
			rel, _ := filepath.Rel(item.Root, path)
			if rel == "." || rel == ".." || strings.HasPrefix(rel, "../") {
				return
			}

			real, err := filepath.EvalSymlinks(path)
			if err != nil || !w.unseen(real) {
				return
			}

			if _, err := os.Lstat(filepath.Join(real, ".git")); err == nil {
				w.collect(real)
			}
		})
	}()
	group.Wait()

	return true
}
