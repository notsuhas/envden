package fs

import (
	e "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/files"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
)

var shortName = regexp.MustCompile(`~[0-9]+(?:\.|$)`)

func relative(root, path string, pulled bool) (string, error) {
	for _, part := range strings.FieldsFunc(path, func(r rune) bool { return r == '/' || r == '\\' }) {
		if part == ".." {
			return "", e.New("INVALID_INPUT", "Unsafe pulled path")
		}
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, abs)
	if err != nil {
		return "", err
	}
	rel = filepath.ToSlash(rel)
	if err = files.ValidatePath(rel); err != nil {
		return "", err
	}
	for _, part := range strings.Split(rel, "/") {
		if strings.EqualFold(part, ".git") || shortName.MatchString(part) {
			return "", e.New("INVALID_INPUT", "Unsafe pulled path")
		}
	}
	if pulled {
		for _, r := range rel {
			if unicode.Is(unicode.Cf, r) {
				return "", e.New("INVALID_INPUT", "Unsafe pulled path")
			}
		}
	}
	return rel, nil
}
