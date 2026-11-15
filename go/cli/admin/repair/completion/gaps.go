package completion

func DeriveGapAction(missing, lost int, acceptLost bool) string {
	if missing > 0 || lost > 0 && !acceptLost {
		return "report"
	}

	return "finish"
}
