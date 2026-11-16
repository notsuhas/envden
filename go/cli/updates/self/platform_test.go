package self

import (
	"errors"
	"testing"
)

func TestCurrentReleasePlatform(t *testing.T) {
	for _, tc := range []struct{ platform, arch, getconf, ldd, want string }{
		{"linux", "amd64", "glibc 2.40\n", "", "linux-x64"},
		{"linux", "arm64", "", "musl libc (aarch64)\nVersion 1.2.5", "linux-arm64-musl"},
		{"linux", "amd64", "", "ldd (GNU libc) 2.40", "linux-x64"},
		{"linux", "amd64", "", "", "linux-x64-musl"},
		{"darwin", "arm64", "", "", "darwin-arm64"},
		{"windows", "amd64", "", "", "windows-x64"},
	} {
		got := currentReleasePlatform(tc.platform, tc.arch, func(name string, _ ...string) ([]byte, error) {
			if tc.platform != "linux" {
				t.Fatal("libc detection outside Linux")
			}
			if name == "getconf" && tc.getconf != "" {
				return []byte(tc.getconf), nil
			}
			if name == "ldd" && tc.ldd != "" {
				return []byte(tc.ldd), errors.New("exit 1")
			}
			return nil, errors.New("not found")
		})
		if got != tc.want {
			t.Errorf("%+v: got %s", tc, got)
		}
	}
}
