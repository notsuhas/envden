package self

import "testing"

func TestPinnedInstall(t *testing.T) {
	for _, r := range []struct{ manager, binary, wantManager, wantBinary string }{{"brew", "/opt/homebrew/Cellar/envden/0.3.8/bin/envden", "/opt/homebrew/bin/brew", "/opt/homebrew/bin/envden"}, {"npm", "/usr/local/lib/node_modules/envden/bin/envden", "/usr/local/bin/npm", "/usr/local/bin/envden"}, {"npm", `C:\Users\me\npm\node_modules\envden\envden.exe`, "C:/Users/me/npm/npm.cmd", `C:\Users\me\npm\node_modules\envden\envden.exe`}, {"scoop", "C:/Users/me/scoop/apps/envden/0.3.8/envden.exe", "C:/Users/me/scoop/shims/scoop.cmd", "C:/Users/me/scoop/shims/envden.exe"}, {"unknown", "/unknown", "", ""}} {
		manager, binary := pinnedInstall(r.manager, r.binary)
		if manager != r.wantManager || binary != r.wantBinary {
			t.Fatal(r, manager, binary)
		}
	}
}
func TestReleasePlatform(t *testing.T) {
	for _, r := range [][4]string{{"win32", "x64", "", "windows-x64"}, {"darwin", "arm64", "", "darwin-arm64"}, {"linux", "x64", "", "linux-x64-musl"}, {"linux", "arm64", "2.40", "linux-arm64"}} {
		if got := ReleasePlatform(r[0], r[1], r[2]); got != r[3] {
			t.Fatal(got)
		}
	}
}
