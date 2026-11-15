package status

type FileFacts struct {
	LocalOnly, Conflict, HeldBack, Changed, Remote bool
	Placement                                      string
}

func DeriveFileState(f FileFacts) string {
	switch {
	case f.LocalOnly:
		return "local-only"
	case f.Conflict:
		return "conflict"
	case f.Placement == "detached":
		return "detached"
	case f.HeldBack:
		return "held-back"
	case f.Placement == "missing":
		if f.Remote {
			return "remote"
		}
		return "missing"
	case f.Changed && f.Remote:
		return "diverged"
	case f.Changed:
		return "changed"
	case f.Remote:
		return "remote"
	default:
		return "in-sync"
	}
}
