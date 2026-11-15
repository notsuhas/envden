package git

import (
	"cmp"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"unicode/utf16"

	"github.com/notsuhas/envden/go/core/adapters"
	"golang.org/x/text/unicode/norm"
)

func envFiles(c adapters.Checkout, rules *adapters.EnvFileRules) ([]string, error) {
	run, err := gitSession(c.Root, nil)
	if err != nil {
		return nil, err
	}
	insensitive, err := caseInsensitive(c.Root, false)
	if err != nil {
		return nil, err
	}
	key := func(s string) string {
		s = norm.NFC.String(s)
		if insensitive {
			s = strings.ToLower(s)
		}

		return s
	}
	out, err := run([]string{"ls-files", "--stage", "-z"}, "")
	if err != nil {
		return nil, err
	}
	tracked := map[string]bool{}
	submodules := map[string]bool{}
	for _, entry := range strings.Split(out, "\x00") {
		if entry == "" {
			continue
		}
		path := entry[strings.Index(entry, "\t")+1:]
		tracked[key(path)] = true
		if strings.HasPrefix(entry, "160000 ") {
			submodules[path] = true
		}
	}
	files := []string{}
	var walk func(string) error
	walk = func(dir string) error {
		entries, e := os.ReadDir(filepath.Join(c.Root, dir))
		if e != nil {
			if dir != "" && os.IsPermission(e) {
				return nil
			}

			return e
		}
		if dir != "" {
			for _, entry := range entries {
				if entry.Name() == ".git" {
					return nil
				}
			}
		}
		for _, entry := range entries {
			path := entry.Name()
			if dir != "" {
				path = dir + "/" + path
			}
			if submodules[path] || validatePath(path) != nil {
				continue
			}
			if entry.IsDir() {
				if adapters.AcceptsEnvPath(path+"/.env", adapters.EnvFileRules{ExtraSkipped: rules.ExtraSkipped}) {
					if e = walk(path); e != nil {
						return e
					}
				}
			} else if (entry.Type().IsRegular() || entry.Type()&os.ModeSymlink != 0) && adapters.AcceptsEnvPath(path, *rules) && !tracked[key(path)] {
				files = append(files, path)
			}
		}

		return nil
	}
	if err = walk(""); err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return files, nil
	}
	out, err = run([]string{"check-ignore", "--stdin", "-z"}, strings.Join(files, "\x00")+"\x00")
	if exitCode(err) == 1 {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	files = []string{}
	for _, p := range strings.Split(out, "\x00") {
		if p != "" {
			files = append(files, p)
		}
	}
	slices.SortFunc(files, comparePaths)

	return files, nil
}

func tracked(c adapters.Checkout, path string) (bool, error) {
	insensitive, err := caseInsensitive(c.Root, false)
	if err != nil {
		return false, err
	}
	out, err := git(c.Root, []string{"ls-files", "-z"}, "")
	if err != nil {
		return false, err
	}
	key := norm.NFC.String(path)
	for _, p := range strings.Split(out, "\x00") {
		p = norm.NFC.String(p)
		lowerPath, lowerKey := strings.ToLower(p), strings.ToLower(key)
		if p == key || insensitive && lowerPath == lowerKey {
			return true, nil
		}
	}

	return false, nil
}

func comparePaths(a, b string) int {
	left, right := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(left) && i < len(right); i++ {
		if c := cmp.Compare(left[i], right[i]); c != 0 {
			return c
		}
	}

	return cmp.Compare(len(left), len(right))
}
