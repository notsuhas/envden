package prompts

import (
	"github.com/notsuhas/envden/go/cli/identity/name"
)

func AskDeviceName(value *string, hostname string, interactive bool) (string, error) {
	if value != nil {
		return *value, nil
	}

	suggested := name.Suggested(hostname)
	if interactive {
		return Input("Device name", true, suggested)
	}

	return suggested, nil
}
