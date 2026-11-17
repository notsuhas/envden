package adapters

import (
	"regexp"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/textcase"
)

var skippedDirectories = map[string]bool{".git": true, "node_modules": true, ".next": true, "dist": true, "build": true, "out": true, "coverage": true, ".turbo": true, ".cache": true, "vendor": true}

var defaultEnvName = regexp.MustCompile(`^\.env(?:\.[^\r\n\x{2028}\x{2029}]+)?$`)

var exampleEnvName = regexp.MustCompile(`\.(example|sample|template|defaults)$`)

func AcceptsEnvPath(path string, rules EnvFileRules) bool {
	accepted, _ := CheckEnvPath(path, rules)

	return accepted
}

func CheckEnvPath(path string, rules EnvFileRules) (bool, error) {
	parts := strings.Split(path, "/")
	name := parts[len(parts)-1]
	for _, part := range parts[:len(parts)-1] {
		lower := textcase.Lower(part)
		if skippedDirectories[lower] {
			return false, nil
		}
		for _, extra := range rules.ExtraSkipped {
			if lower == textcase.Lower(extra) {
				return false, nil
			}
		}
	}
	if textcase.Lower(name) == ".envrc" {
		return false, nil
	}
	var err error
	included := defaultEnvName.MatchString(name)
	if rules.Include != nil {
		included, err = matchesPatterns(rules.Include, path, name)
		if err != nil {
			return false, err
		}
	}
	if !included {
		return false, nil
	}

	excluded := exampleEnvName.MatchString(name)
	if rules.Exclude != nil {
		excluded, err = matchesPatterns(rules.Exclude, path, name)
		if err != nil {
			return false, err
		}
	}

	return !excluded, nil
}

func matchesPatterns(patterns []string, path, name string) (bool, error) {
	for _, pattern := range patterns {
		if UnsupportedEnvPattern(pattern) {
			return false, errors.New(errors.InvalidInput, "Unsupported env file pattern")
		}

		target := name
		if strings.Contains(pattern, "/") {
			target = path
		}
		if globMatch(pattern, target) {
			return true, nil
		}
	}

	return false, nil
}
