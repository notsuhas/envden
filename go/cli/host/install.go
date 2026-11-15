package host

import (
	"encoding/binary"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf16"
)

type Options struct {
	Platform, Executable, UserHome, Home string
	Port, UID                            int
	Write                                func(string, []byte, func() int64) error
	Run                                  func([]string) error
	Pause                                func(int64) error
}
type Installed struct{ Log, Path string }

func InstallHostService(o Options, now func() int64) (Installed, error) {
	log := filepath.Join(o.Home, "server.log")
	def, err := ServiceDefinition(o.Platform, o.Executable, filepath.Join(o.Home, "server"), log, o.Port)
	if err != nil {
		return Installed{}, err
	}
	path := ServiceFile(o.Platform, o.UserHome, o.Home)
	content := []byte(def.Content)
	if def.Kind == "task" {
		words := utf16.Encode([]rune(def.Content))
		content = make([]byte, len(words)*2)
		for i, w := range words {
			binary.LittleEndian.PutUint16(content[2*i:], w)
		}
	}
	if err = o.Write(path, content, now); err != nil {
		return Installed{}, err
	}
	switch def.Kind {
	case "launchd":
		gui := "gui/" + strconv.Itoa(o.UID)
		_ = o.Run([]string{"launchctl", "bootout", gui + "/com.envden.server"})
		for attempt := 1; ; attempt++ {
			err = o.Run([]string{"launchctl", "bootstrap", gui, path})
			if err == nil || attempt >= 10 {
				break
			}
			if err = o.Pause(300); err != nil {
				break
			}
		}
	case "systemd":
		for _, args := range [][]string{{"systemctl", "--user", "daemon-reload"}, {"systemctl", "--user", "enable", "envden.service"}, {"systemctl", "--user", "restart", "envden.service"}} {
			if err = o.Run(args); err != nil {
				break
			}
		}
	default:
		_ = o.Run([]string{"schtasks", "/End", "/TN", "envden"})
		err = o.Run([]string{"schtasks", "/Create", "/TN", "envden", "/XML", path, "/F"})
		if err == nil {
			err = o.Run([]string{"schtasks", "/Run", "/TN", "envden"})
		}
	}
	return Installed{log, path}, err
}
func ServiceFile(platform, userHome, home string) string {
	switch platform {
	case "darwin":
		return filepath.Join(userHome, "Library", "LaunchAgents", "com.envden.server.plist")
	case "linux":
		return filepath.Join(userHome, ".config", "systemd", "user", "envden.service")
	case "win32", "windows":
		return filepath.Join(home, "envden-task.xml")
	}
	return ""
}
func RunServiceCommand(args []string) error {
	result, err := process.ExecTrusted(args[0], args[1:], process.Options{Stdout: "ignore", Stderr: "pipe"})
	if err != nil {
		if result.ExitCode == 0 {
			return err
		}
		message := strings.TrimSpace(result.Stderr)
		if message == "" {
			message = args[0] + " exited " + strconv.Itoa(result.ExitCode)
		}
		r := []rune(message)
		if len(r) > 300 {
			message = string(r[:300])
		}
		return errors.New(errors.Internal, "Could not start the envden server service: "+message)
	}
	return nil
}
func WriteThrough(path string, data []byte, now func() int64) error {
	current, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	for hops := 0; hops < 40; hops++ {
		real, e := filepath.EvalSymlinks(current)
		if e == nil {
			return files.AtomicWrite(real, data, now)
		}
		if !os.IsNotExist(e) {
			return e
		}
		info, e := os.Lstat(current)
		if e != nil && !os.IsNotExist(e) {
			return e
		}
		if info == nil || info.Mode()&os.ModeSymlink == 0 {
			parent := filepath.Dir(current)
			if e = os.MkdirAll(parent, 0777); e != nil {
				return e
			}
			real, e = filepath.EvalSymlinks(parent)
			if e != nil {
				return e
			}
			return files.AtomicWrite(filepath.Join(real, filepath.Base(current)), data, now)
		}
		target, e := os.Readlink(current)
		if e != nil {
			return e
		}
		if filepath.IsAbs(target) {
			current = target
		} else {
			current = filepath.Join(filepath.Dir(current), target)
		}
	}
	return errors.New(errors.InvalidInput, "Too many symbolic links")
}
