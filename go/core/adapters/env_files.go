package adapters

import (
	"regexp"
	"strings"
)

var skippedDirectories = map[string]bool{".git": true, "node_modules": true, ".next": true, "dist": true, "build": true, "out": true, "coverage": true, ".turbo": true, ".cache": true, "vendor": true}
var defaultEnvName = regexp.MustCompile(`^\.env(?:\.[^\r\n\x{2028}\x{2029}]+)?$`)
var exampleEnvName = regexp.MustCompile(`\.(example|sample|template|defaults)$`)

func AcceptsEnvPath(path string, rules EnvFileRules) bool {
	parts := strings.Split(path, "/")
	name := parts[len(parts)-1]
	for _, part := range parts[:len(parts)-1] {
		lower := strings.ToLower(part)
		if skippedDirectories[lower] {
			return false
		}
		for _, extra := range rules.ExtraSkipped {
			if lower == strings.ToLower(extra) {
				return false
			}
		}
	}
	if strings.EqualFold(name, ".envrc") {
		return false
	}
	included := defaultEnvName.MatchString(name)
	if rules.Include != nil {
		included = matchesPatterns(rules.Include, path, name)
	}
	excluded := exampleEnvName.MatchString(name)
	if rules.Exclude != nil {
		excluded = matchesPatterns(rules.Exclude, path, name)
	}
	return included && !excluded
}

func matchesPatterns(patterns []string, path, name string) bool {
	for _, pattern := range patterns {
		target := name
		if strings.Contains(pattern, "/") {
			target = path
		}
		if globMatch(pattern, target) {
			return true
		}
	}
	return false
}
