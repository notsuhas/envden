package blockinput

import (
	"os"
	"sync"

	"golang.org/x/sys/windows"
)

func Start(input *os.File, consume func([]byte) bool, escapePending func() bool) (func(), error) {
	event, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		return nil, err
	}
	handle := windows.Handle(input.Fd())
	done := make(chan struct{})
	go func() {
		defer close(done)
		buffer := make([]byte, 4096)
		for {
			timeout := uint32(windows.INFINITE)
			if escapePending() {
				timeout = 500
			}
			ready, err := windows.WaitForMultipleObjects([]windows.Handle{event, handle}, false, timeout)
			if err != nil || ready == windows.WAIT_OBJECT_0 {
				return
			}
			if ready == uint32(windows.WAIT_TIMEOUT) {
				if consume(nil) {
					return
				}
				continue
			}
			n, err := input.Read(buffer)
			if n > 0 && consume(buffer[:n]) {
				return
			}
			if err != nil || n == 0 {
				return
			}
		}
	}()
	var once sync.Once
	return func() {
		once.Do(func() {
			_ = windows.SetEvent(event)
			_ = windows.CancelIoEx(handle, nil)
			<-done
			_ = windows.CloseHandle(event)
		})
	}, nil
}
