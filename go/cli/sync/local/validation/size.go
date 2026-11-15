package validation

import "github.com/notsuhas/envden/go/cli/output"

func FileSizeNotice(path string, value []byte) string {
	if len(value) > 1048576 {
		return output.SanitizeTerminal("Skipped oversized env file: " + path + " exceeds 1 MiB")
	}

	return ""
}
