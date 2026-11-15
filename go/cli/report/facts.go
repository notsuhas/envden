package report

import (
	"github.com/notsuhas/envden/go/cli/host"
	"github.com/notsuhas/envden/go/cli/report/content"
	"github.com/notsuhas/envden/go/cli/updates"
	"github.com/notsuhas/envden/go/cli/version"
	"io"
	"os"
	"path/filepath"
	"runtime"
)

func ReportFacts(home, userHome string, err error, argv []string, env map[string]string, binary, osRelease string) content.Facts {
	platform := runtime.GOOS
	if platform == "windows" {
		platform = "win32"
	}
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "x64"
	}
	f := content.Facts{Version: version.Version, OS: platform + " " + osRelease, Arch: arch, Install: "unknown", Args: content.MaskArguments(argv), Failure: content.DescribeFailure(err), Files: []content.File{}, UserHome: userHome}
	if method, e := updates.InstallMethod(home, "", binary, env); e == nil {
		f.Install = method.Kind
		if method.Kind == "manager" {
			f.Install = method.Command[0]
		}
	}
	log := filepath.Join(home, "server.log")
	if stat, e := os.Lstat(log); e == nil && stat.Mode().IsRegular() {
		file, e := os.Open(log)
		if e == nil {
			defer file.Close()
			offset := max(int64(0), stat.Size()-65536)
			if _, e = file.Seek(offset, 0); e == nil {
				if raw, e := io.ReadAll(file); e == nil {
					text := string(raw)
					f.ServerLog = &text
				}
			}
		}
	}
	for _, path := range []string{log, filepath.Join(home, "state") + string(filepath.Separator), filepath.Join(home, "config.json"), host.ServiceFile(runtime.GOOS, userHome, home)} {
		if path != "" {
			_, e := os.Lstat(path)
			f.Files = append(f.Files, content.File{Path: path, Exists: e == nil})
		}
	}
	return f
}
