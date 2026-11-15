package output

func SkipsNotices(name string, json bool) bool {
	if json {
		return true
	}

	switch name {
	case "status", "version", "config", "help", "update", "serve":
		return true
	}

	return false
}
