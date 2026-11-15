package git

import (
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/adapters/repo/git/internal/fsmeta"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

func isIgnored(c adapters.Checkout, path string) (bool, error) {
	if err := validatePath(path); err != nil {
		return false, err
	}
	yes, err := tracked(c, path)
	if err != nil || yes {
		return false, err
	}
	_, err = git(c.Root, []string{"check-ignore", "-q", "--", path}, "")
	if exitCode(err) == 1 {
		return false, nil
	}

	return err == nil, err
}

type parent struct {
	path string
	stat os.FileInfo
}

func excludeParents(gitDir, exclude string) ([]parent, error) {
	common, err := filepath.EvalSymlinks(gitDir)
	if err != nil {
		return nil, err
	}
	rel, err := filepath.Rel(common, filepath.Dir(exclude))
	if err != nil {
		return nil, err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return nil, errors.New(errors.InvalidInput, "Exclude path escapes git directory")
	}
	parts := []string{""}
	if rel != "." {
		parts = append(parts, strings.Split(rel, string(filepath.Separator))...)
	}
	parents := []parent{}
	current := common
	for _, part := range parts {
		current = filepath.Join(current, part)
		if err = os.Mkdir(current, 0700); err != nil && !os.IsExist(err) {
			return nil, err
		}
		s, e := os.Lstat(current)
		if e != nil {
			return nil, e
		}
		if !s.IsDir() || s.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New(errors.InvalidInput, "Unsafe exclude parent")
		}
		parents = append(parents, parent{current, s})
	}

	return parents, nil
}

func verifyParents(parents []parent) error {
	for _, p := range parents {
		real, err := filepath.EvalSymlinks(p.path)
		if err != nil {
			return err
		}
		s, err := os.Lstat(p.path)
		if err != nil {
			return err
		}
		if real != p.path || !s.IsDir() || !os.SameFile(p.stat, s) {
			return errors.New(errors.Conflict, "Exclude parent changed")
		}
	}

	return nil
}

func ensureIgnored(c adapters.Checkout, path string) error {
	if err := validatePath(path); err != nil {
		return err
	}
	yes, err := tracked(c, path)
	if err != nil {
		return err
	}
	if yes {
		return errors.New(errors.InvalidInput, "Refusing a tracked env file")
	}
	yes, err = isIgnored(c, path)
	if err != nil || yes {
		return err
	}
	if unsafeText(path) {
		return errors.New(errors.InvalidInput, "Unsafe ignore path")
	}
	out, err := git(c.Root, []string{"rev-parse", "--git-path", "info/exclude"}, "")
	if err != nil {
		return err
	}
	exclude := resolvePath(c.Root, strings.TrimRight(out, " \r\n\t"))
	parents, err := excludeParents(c.GitDir, exclude)
	if err != nil {
		return err
	}
	escaped := ""
	for _, r := range path {
		if strings.ContainsRune(`\*?[]#! `, r) {
			escaped += `\`
		}
		escaped += string(r)
	}
	f, err := os.OpenFile(exclude, os.O_RDWR|os.O_APPEND|os.O_CREATE|fsmeta.NoFollow|fsmeta.NonBlock, 0600)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	s, err := f.Stat()
	if err != nil {
		return err
	}
	if !fsmeta.PrivateRegular(exclude, s) {
		return errors.New(errors.InvalidInput, "Exclude is not a private regular file")
	}
	real, err := filepath.EvalSymlinks(filepath.Dir(exclude))
	if err != nil {
		return err
	}
	if real != filepath.Dir(exclude) {
		return errors.New(errors.InvalidInput, "Unsafe exclude parent")
	}
	if err = verifyParents(parents); err != nil {
		return err
	}
	b, err := io.ReadAll(f)
	if err != nil {
		return err
	}
	line := "/" + escaped
	added := true
	for _, existing := range strings.Split(string(b), "\n") {
		if existing == line {
			added = false
		}
	}
	suffix := "\n" + line + "\n"
	if added {
		if _, err = f.WriteString(suffix); err != nil {
			return err
		}
	}
	yes, err = isIgnored(c, path)
	if err == nil && !yes {
		err = errors.New(errors.InvalidInput, "Could not ignore env file")
	}
	if err != nil && added {
		if now, e := f.Stat(); e == nil && now.Size() == s.Size()+int64(len(suffix)) {
			_ = f.Truncate(s.Size())
		}
	}

	return err
}
