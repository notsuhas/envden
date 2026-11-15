package content

import (
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"regexp"
)

var secretKey = regexp.MustCompile(`(?i)EK1(?:-[0-9A-Z]{1,5})+`)
var base32Run = regexp.MustCompile(`(?i)\b[0-9A-HJKMNP-TV-Z]{40,}\b`)
var envLine = regexp.MustCompile(`(?m)^(\s*(?:export\s+)?[A-Za-z_][\w.-]*\s*=).*$`)
var assignment = regexp.MustCompile(`\b([A-Za-z_][\w.-]*)=("[^"]*"|'[^']*'|[^\s&"']+)`)

func RedactSecrets(text string) string {
	text = secretKey.ReplaceAllString(text, "EK1-[redacted]")
	text = base32Run.ReplaceAllStringFunc(text, func(run string) string {
		if _, e := proofs.DecodeToken("setup", run); e == nil {
			return "[setup token]"
		}
		if _, e := proofs.DecodeToken("repair", run); e == nil {
			return "[repair token]"
		}
		return "[redacted]"
	})
	text = envLine.ReplaceAllString(text, "${1}[redacted]")
	return assignment.ReplaceAllString(text, "${1}=[redacted]")
}
