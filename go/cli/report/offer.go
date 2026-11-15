package report

import (
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
)

func DeriveReportOffer(err error, command string, interactive bool, env map[string]string) bool {
	if !interactive || env["ENVDEN_NO_REPORT"] == "1" {
		return false
	}

	for _, key := range strings.Fields("AI_AGENT CLAUDECODE CLAUDE_CODE_ENTRYPOINT CODEX_SANDBOX CODEX_SANDBOX_NETWORK_DISABLED CODEX_THREAD_ID CODEX_CI GEMINI_CLI CURSOR_AGENT OPENCODE") {
		if env[key] != "" {
			return false
		}
	}

	v, ok := errors.As(err)
	if !ok {
		return true
	}

	if v.Message == "Cancelled" {
		return false
	}

	if v.Code == errors.Conflict && (command == "push" || command == "pull" || command == "resolve") {
		return false
	}

	switch v.Code {
	case errors.InvalidInput, errors.Unauthorized, errors.Locked, errors.RateLimited, errors.UpdateRequired, errors.ClientTooOld, errors.NotFound, errors.StorageQuota, errors.ServerUnreachable:
		return false
	}

	return true
}
