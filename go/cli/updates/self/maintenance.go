package self

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"

	"github.com/notsuhas/envden/go/cli/agent"
	servicepkg "github.com/notsuhas/envden/go/cli/agent/service"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/host"
)

func RefreshInstallation(a contracts.Adapters, w io.Writer) {
	tasks := []func() error{func() error {
		if _, e := os.Stat(filepath.Join(a.UserHome, ".agents", "skills", "envden", "SKILL.md")); e == nil {
			return agent.InstallAgent(a.UserHome, a.Now)
		}

		return nil
	}, func() error {
		service := host.ServiceFile(runtime.GOOS, a.UserHome, a.Home)
		if _, e := os.Stat(service); e != nil {
			return nil //nolint:nilerr // A missing service needs no refresh.
		}

		port := host.DefaultServerPort
		if installed := servicepkg.InstalledServicePort(runtime.GOOS, a.UserHome, a.Home); installed != nil {
			port = *installed
		}

		_, e := a.HostServer(port)

		return e
	}}
	for _, name := range []string{"zsh", "bash", "fish", "powershell"} {
		tasks = append(tasks, func() error {
			s := a.Shell(name)
			installed, e := s.Installed()
			if e != nil {
				return e
			}

			if installed {
				return s.Install(a.Executable)
			}

			return nil
		})
	}

	for _, task := range tasks {
		if task() != nil {
			_, _ = fmt.Fprintln(w, "envden: binary updated; optional installation refresh failed")
		}
	}
}
