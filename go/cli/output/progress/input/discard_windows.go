package input

import (
	"golang.org/x/sys/windows"
	"os"
)

func Discard(file *os.File) { _ = windows.FlushConsoleInputBuffer(windows.Handle(file.Fd())) }
