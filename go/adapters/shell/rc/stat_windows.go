package rc

import (
	"os"
	"reflect"
	"strings"

	"golang.org/x/sys/windows"

	errors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
)

const noFollow = 0

func validateRC(path string, s os.FileInfo) error {
	if !s.Mode().IsRegular() || !singleLink(path) {
		return errors.New(errors.InvalidInput, "Unsafe shell configuration file")
	}
	return nil
}

func sameRC(a, b os.FileInfo) bool {
	return os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime() == b.ModTime() && reflect.DeepEqual(a.Sys(), b.Sys())
}

func safeBackup(s os.FileInfo) bool { return s.IsDir() }

func verifyOwner(path string) error {
	out, e := process.ExecTrusted("powershell.exe", []string{"-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; $p=$env:ENVDEN_RC_PATH; $a=[IO.File]::GetAttributes($p); if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }; $acl=if (($a -band [IO.FileAttributes]::Directory) -ne 0) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }; $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent(); ($owner -eq $identity.User.Value) -or ($owner -eq $identity.Owner.Value)"}, process.Options{Env: map[string]string{"ENVDEN_RC_PATH": path}})
	if e != nil {
		return e
	}
	if strings.TrimSpace(out.Stdout) != "True" {
		return errors.New(errors.InvalidInput, "Unsafe shell configuration owner")
	}
	return nil
}

func prepareBackup(path string) error {
	if e := verifyOwner(path); e != nil {
		return e
	}
	return process.RestrictAccess(path, true)
}

func singleLink(path string) bool {
	p, e := windows.UTF16PtrFromString(path)
	if e != nil {
		return false
	}
	h, e := windows.CreateFile(p, 0, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if e != nil {
		return false
	}
	defer windows.CloseHandle(h)
	var i windows.ByHandleFileInformation
	return windows.GetFileInformationByHandle(h, &i) == nil && i.NumberOfLinks == 1
}
