package process

import (
	"os"
	"os/user"
)

type PermissionRuntime struct {
	Platform string
	Exec     func(string, []string) error
	Username string
}

func RestrictAccess(path string, directory bool, runtimes ...PermissionRuntime) error {
	r := PermissionRuntime{Platform: platformName()}
	if len(runtimes) > 0 {
		r = runtimes[0]
	}
	if r.Platform == "win32" {
		name := r.Username
		if name == "" {
			u, err := user.Current()
			if err != nil {
				return err
			}
			name = u.Username
		}
		rights := "F"
		if directory {
			rights = "(OI)(CI)F"
		}
		args := []string{path, "/inheritance:r", "/grant:r", name + ":" + rights}
		if r.Exec != nil {
			return r.Exec("icacls", args)
		}
		_, err := ExecTrusted("icacls", args, Options{})
		return err
	}
	mode := os.FileMode(0600)
	if directory {
		mode = 0700
	}
	return os.Chmod(path, mode)
}
func RestrictAccessSync(path string, directory bool, runtimes ...PermissionRuntime) error {
	return RestrictAccess(path, directory, runtimes...)
}
