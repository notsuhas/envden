package prompts

import (
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/lib/clack"
)

func ChooseVersion(interactive bool, terminal *clack.Terminal, path string) (string, error) {
	if !interactive {
		return "skip", nil
	}
	return answer(terminal.Select(clack.PromptOptions{Message: output.SanitizeTerminal(path + " differs from the synced copy"), Options: []clack.Option{{Value: "separate", Label: "Keep separate (local only)"}, {Value: "store", Label: "Use the synced version"}}}))
}
