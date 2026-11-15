package guidance

func RestoreBlock(status string) string {
	switch status {
	case "local-only":
		return "Local-only files have no history on the server."
	case "conflict":
		return "Choose a side in Conflicts before restoring."
	case "detached":
		return "This file is detached; press Pull to reconcile it first."
	default:
		return ""
	}
}
