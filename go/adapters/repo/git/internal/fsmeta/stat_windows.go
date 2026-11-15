package fsmeta

import (
	"os"

	"golang.org/x/sys/windows"
)

const NoFollow = 0

const NonBlock = 0

func PrivateRegular(path string, s os.FileInfo) bool {
	if !s.Mode().IsRegular() {
		return false
	}
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
