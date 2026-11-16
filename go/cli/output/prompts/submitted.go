package prompts

import (
	"fmt"
	"slices"
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
)

func (t *session) submitted(o PromptOptions, answer string) {
	_, _ = fmt.Fprintf(t.output, "%s\n  %s\n", output.SanitizeTerminal(o.Message), output.SanitizeTerminal(answer))
}

func selectedLabels(options []Option, values []string) string {
	labels := []string{}
	for _, option := range options {
		if slices.Contains(values, option.Value) {
			labels = append(labels, option.Label)
		}
	}

	return strings.Join(labels, ", ")
}
