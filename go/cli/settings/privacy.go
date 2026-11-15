package settings

var TelemetryKey = ""

func TelemetryEnabled(configured bool, env map[string]string) bool {
	return configured && env["ENVDEN_TELEMETRY"] != "0" && env["DO_NOT_TRACK"] != "1"
}
func UpdateCheckEnabled(configured bool, env map[string]string) bool {
	return configured && env["ENVDEN_NO_UPDATE_CHECK"] != "1"
}
