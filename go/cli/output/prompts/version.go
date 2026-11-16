package prompts

import (
	"github.com/notsuhas/envden/go/cli/output"
)

func ChooseVersion(interactive bool, terminal ITerminal, path string) (string, error) {
	if !interactive {
		return "skip", nil
	}
	return answer(terminal.Select(PromptOptions{Message: output.SanitizeTerminal(path + " differs from the synced copy"), Options: []Option{{Value: "separate", Label: "Keep separate (local only)"}, {Value: "store", Label: "Use the synced version"}}}))
}
