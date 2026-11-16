package members

import "unicode"

func IsDeviceName(name string) bool {
	if len(name) < 1 || len(name) > 64 {
		return false
	}

	for _, r := range name {
		if unicode.Is(unicode.Cc, r) || unicode.Is(unicode.Cf, r) {
			return false
		}
	}

	return true
}
