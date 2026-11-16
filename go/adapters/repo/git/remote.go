package git

import (
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	whatwg "github.com/nlnwa/whatwg-url/url"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/textcase"
)

type remoteInfo struct {
	host, path string
	ssh        bool
}

func unsafeText(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Cc, r) || unicode.Is(unicode.Cf, r) {
			return true
		}
	}

	return false
}

func remoteParts(remote string) (remoteInfo, error) {
	invalid := errors.New(errors.InvalidInput, "Unsupported git remote")
	if strings.Contains(remote, "://") {
		if !regexp.MustCompile(`(?i)^(ssh|https?|git)://`).MatchString(remote) {
			return remoteInfo{}, invalid
		}
		decoded, err := url.PathUnescape(remote)
		if err != nil {
			return remoteInfo{}, err
		}
		for _, part := range strings.Split(decoded, "/") {
			if part == "." || part == ".." {
				return remoteInfo{}, errors.New(errors.InvalidInput, "Unsafe git remote")
			}
		}
		u, err := whatwg.Parse(remote)
		if err != nil {
			return remoteInfo{}, err
		}
		if u.Hostname() == "" || u.Search() != "" || u.Hash() != "" {
			return remoteInfo{}, invalid
		}
		path, err := url.PathUnescape(u.Pathname())
		if err != nil {
			return remoteInfo{}, err
		}

		return remoteInfo{u.Hostname(), path, u.Protocol() == "ssh:"}, nil
	}
	match := regexp.MustCompile(`^(?:[^@/\s]+@)?(\[[^\]]+\]|[^:/\s]+):(.+)$`).FindStringSubmatch(remote)
	if match == nil {
		return remoteInfo{}, errors.New(errors.InvalidInput, "A hosted git remote is required")
	}

	return remoteInfo{match[1], match[2], true}, nil
}

func normalizeRepoID(remote, resolved string) (string, error) {
	invalid := errors.New(errors.InvalidInput, "Unsafe git remote")
	decoded, err := url.PathUnescape(remote)
	if err != nil || !utf8.ValidString(decoded) || unsafeText(decoded) {
		return "", invalid
	}
	p, err := remoteParts(textcase.Trim(remote))
	if err != nil {
		if _, ok := errors.As(err); ok {
			return "", err
		}

		return "", errors.Wrap(errors.InvalidInput, "Unsafe git remote", err)
	}
	host := p.host
	if resolved != "" {
		host = resolved
	}
	host = textcase.Lower(host)
	path := strings.Trim(p.path, "/")
	if strings.HasSuffix(textcase.Lower(path), ".git") {
		path = path[:len(path)-4]
	}
	if host == "github.com" || host == "gitlab.com" {
		path = textcase.Lower(path)
	}
	if host == "" || path == "" || unsafeText(host+path) || strings.ContainsAny(host, `\/`) || strings.ContainsFunc(host, unicode.IsSpace) || strings.Contains(path, `\`) {
		return "", invalid
	}
	for _, part := range strings.Split(path, "/") {
		if part == "" || part == "." || part == ".." {
			return "", invalid
		}
	}

	return host + "/" + path, nil
}

func resolveSSHHost(host string) (string, error) { return resolveSSHHostWith(host, trustedOutput) }

func resolveSSHHostWith(host string, run func(string, []string, map[string]string, string) (string, error)) (string, error) {
	if strings.HasPrefix(host, "-") || !regexp.MustCompile(`^[A-Za-z0-9._-]+$`).MatchString(host) {
		return "", errors.New(errors.InvalidInput, "Unsafe SSH host")
	}
	out, err := run("ssh", []string{"-G", "--", host}, nil, "")
	if err != nil {
		return "", err
	}
	m := regexp.MustCompile(`(?m)^hostname\s+(.+)$`).FindStringSubmatch(out)
	if m == nil {
		return "", errors.New(errors.Internal, "SSH hostname resolution failed")
	}

	return textcase.Trim(m[1]), nil
}

func remoteID(root, name string, resolve func(string) (string, error)) (string, error) {
	config, err := globalConfig(`^url\..*\.insteadof$`)
	if err != nil {
		return "", err
	}
	run, err := gitSession(root, config)
	if err != nil {
		return "", err
	}
	remote, err := run([]string{"remote", "get-url", name}, "")
	if err != nil {
		return "", err
	}
	remote = textcase.Trim(remote)
	parts, err := remoteParts(remote)
	if err != nil {
		return "", err
	}
	host := ""
	if parts.ssh {
		host, err = resolve(parts.host)
		if err == nil && host == "" {
			return "", errors.New(errors.InvalidInput, "Unsafe git remote")
		}
		if err != nil {
			return "", err
		}
	}

	return normalizeRepoID(remote, host)
}

func NormalizeRepoID(remote string, resolvedHostname ...string) (string, error) {
	resolved := ""
	if len(resolvedHostname) > 0 {
		if resolvedHostname[0] == "" {
			return "", errors.New(errors.InvalidInput, "Unsafe git remote")
		}
		resolved = resolvedHostname[0]
	}

	return normalizeRepoID(remote, resolved)
}
