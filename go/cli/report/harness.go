package report

type Harness struct{ ID, Name, Path string }

func DetectHarnesses(which func(string) string) []Harness {
	result := []Harness{}
	for _, h := range []Harness{{ID: "claude", Name: "Claude Code"}, {ID: "codex", Name: "Codex"}, {ID: "gemini", Name: "Gemini CLI"}} {
		if path := which(h.ID); path != "" {
			h.Path = path
			result = append(result, h)
		}
	}

	return result
}

func LaunchCommand(h Harness, prompt string) []string {
	command := []string{h.Path}
	if h.ID == "gemini" {
		command = append(command, "-i")
	}

	return append(command, prompt)
}
