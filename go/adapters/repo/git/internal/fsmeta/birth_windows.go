package fsmeta

import (
	"os"
	"strconv"

	"golang.org/x/sys/windows"
)

func Identity(path string, _ os.FileInfo) (uint64, uint64, string, error) {
	p, e := windows.UTF16PtrFromString(path)
	if e != nil {
		return 0, 0, "", e
	}
	h, e := windows.CreateFile(p, 0, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if e != nil {
		return 0, 0, "", e
	}
	defer windows.CloseHandle(h)
	var i windows.ByHandleFileInformation
	if e = windows.GetFileInformationByHandle(h, &i); e != nil {
		return 0, 0, "", e
	}
	return uint64(i.VolumeSerialNumber), uint64(i.FileIndexHigh)<<32 | uint64(i.FileIndexLow), strconv.FormatFloat(float64(i.CreationTime.Nanoseconds())/1e6, 'f', -1, 64), nil
}
