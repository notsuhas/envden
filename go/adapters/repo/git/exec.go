package git

import (
	"strconv"
	"strings"

	errors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	"github.com/notsuhas/envden/go/core/protocol/files"
)

type configEntry struct{ key, value string }

func trustedOutput(name string, args []string, env map[string]string, input string) (string, error) {
	o, e := process.ExecTrusted(name, args, process.Options{Env: env, Input: []byte(input)})
	return o.Stdout, e
}

func exitCode(err error) int {
	if e, ok := errors.As(err); ok {
		if cause, ok := e.Cause.(*process.ExitError); ok {
			return cause.ExitCode
		}
	}
	return -1
}

func globalConfig(pattern string) ([]configEntry, error) {
	out, err := trustedOutput("git", []string{"config", "--global", "--null", "--get-regexp", pattern}, map[string]string{"GIT_CONFIG_NOSYSTEM": "1"}, "")
	if exitCode(err) == 1 {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	entries := []configEntry{}
	for _, r := range strings.Split(out, "\x00") {
		if i := strings.Index(r, "\n"); i >= 0 {
			entries = append(entries, configEntry{r[:i], r[i+1:]})
		}
	}
	return entries, nil
}

func gitSession(root string, config []configEntry) (func([]string, string) (string, error), error) {
	directories, err := globalConfig(`^safe\.directory$`)
	if err != nil {
		return nil, err
	}
	prefix := []string{}
	for _, s := range []string{"safe.bareRepository=explicit", "core.fsmonitor=false", "core.untrackedCache=false", "core.hooksPath=/dev/null", "core.pager=cat", "protocol.allow=never", "diff.external=", "core.sshCommand=false", "core.attributesFile=/dev/null"} {
		prefix = append(prefix, "-c", s)
	}
	for _, d := range directories {
		prefix = append(prefix, "-c", d.key+"="+d.value)
	}
	env := map[string]string{"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_PAGER": "cat", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"}
	if len(config) > 0 {
		env["GIT_CONFIG_COUNT"] = strconv.Itoa(len(config))
		for i, c := range config {
			env["GIT_CONFIG_KEY_"+strconv.Itoa(i)] = c.key
			env["GIT_CONFIG_VALUE_"+strconv.Itoa(i)] = c.value
		}
	}
	return func(args []string, input string) (string, error) {
		all := append([]string{}, prefix...)
		if len(args) > 0 && args[0] == "ls-files" {
			all = append(all, "--literal-pathspecs")
		}
		all = append(all, "-C", root)
		all = append(all, args...)
		return trustedOutput("git", all, env, input)
	}, nil
}

func git(root string, args []string, input string) (string, error) {
	run, err := gitSession(root, nil)
	if err != nil {
		return "", err
	}
	return run(args, input)
}

func validatePath(path string) error { return files.ValidatePath(path) }
