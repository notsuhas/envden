package restore

func RestoreGate(yes, interactive, agentMerge bool) (string, string) {
	if interactive {
		if yes {
			return "proceed", ""
		}

		return "confirm", ""
	}

	if !agentMerge {
		return "refused", "Restore requires a terminal; use config agent-merge on before --yes"
	}

	if !yes {
		return "refused", "Non-interactive restore requires --yes"
	}

	return "proceed", ""
}
