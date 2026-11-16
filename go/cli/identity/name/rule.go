package name

import "github.com/notsuhas/envden/go/core/protocol/codecs/members"

const DeviceNameRule = "Device names are 1-64 bytes with no invisible characters"

func Problem(value string) string {
	if members.IsDeviceName(value) {
		return ""
	}

	return DeviceNameRule
}
