package content

import (
	"regexp"
	"strings"
)

func MaskArguments(args []string) []string {
	masked := []string{}
	secret := func(s string) bool { return s == "--setup-token" || s == "--repair-token" || s == "--recovery-kit" }
	for i, arg := range args {
		flag, _, has := strings.Cut(arg, "=")
		if regexp.MustCompile(`(?i)^--?[\w-]*pass`).MatchString(flag) {
			if has {
				masked = append(masked, flag+"=[redacted]")
			} else {
				masked = append(masked, arg)
			}
			for range args[i+1:] {
				masked = append(masked, "[redacted]")
			}
			return masked
		}
		if secret(flag) && has {
			masked = append(masked, flag+"=[redacted]")
		} else if i > 0 && secret(args[i-1]) {
			masked = append(masked, "[redacted]")
		} else {
			masked = append(masked, arg)
		}
	}
	return masked
}
