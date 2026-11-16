//go:build darwin || linux

package blockinput

import (
	"os"
	"sync"

	"golang.org/x/sys/unix"
)

func Start(input *os.File, consume func([]byte) bool, escapePending func() bool) (func(), error) {
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		fds := []unix.PollFd{{Fd: int32(input.Fd()), Events: unix.POLLIN}, {Fd: int32(reader.Fd()), Events: unix.POLLIN}} //nolint:gosec // File descriptors fit the OS poll descriptor type.
		buffer := make([]byte, 4096)
		for {
			timeout := -1
			if escapePending() {
				timeout = 500
			}
			ready, err := unix.Poll(fds, timeout)
			if err == unix.EINTR {
				continue
			}
			if err != nil || fds[1].Revents != 0 {
				return
			}
			if ready == 0 {
				if consume(nil) {
					return
				}
				continue
			}
			if fds[0].Revents != 0 {
				n, err := input.Read(buffer)
				if n > 0 {
					if consume(buffer[:n]) {
						return
					}
				}
				if err != nil || n == 0 {
					return
				}
			}
		}
	}()
	var once sync.Once
	return func() {
		once.Do(func() { _, _ = writer.Write([]byte{1}); <-done; _ = reader.Close(); _ = writer.Close() })
	}, nil
}
