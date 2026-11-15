//go:build !windows

package fs

import (
	"errors"
	e "github.com/notsuhas/envden/go/core/errors"
	"golang.org/x/sys/unix"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func descriptor(err error) error {
	if err == nil {
		return nil
	}
	return e.Wrap("CONFLICT", "Descriptor-relative operation failed", err)
}

func openParent(root, path string, create bool) (int, error) {
	fd, err := unix.Open(root, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return -1, descriptor(err)
	}
	for _, part := range strings.Split(filepath.ToSlash(filepath.Dir(path)), "/") {
		if part == "." {
			continue
		}
		if create {
			_ = unix.Mkdirat(fd, part, 0700)
		}
		next, err := unix.Openat(fd, part, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		unix.Close(fd)
		if err != nil {
			if !create && errors.Is(err, unix.ENOENT) {
				return -1, e.New("NOT_FOUND", "Checkout parent is missing")
			}
			return -1, e.Wrap("CONFLICT", "Unsafe checkout parent", err)
		}
		fd = next
	}
	return fd, nil
}

type entryIdentity struct {
	dev, ino     uint64
	size         int64
	mtime, ctime unix.Timespec
}

func identity(fd int, name string) (*entryIdentity, error) {
	var st unix.Stat_t
	err := unix.Fstatat(fd, name, &st, unix.AT_SYMLINK_NOFOLLOW)
	if errors.Is(err, unix.ENOENT) {
		return nil, nil
	}
	if err != nil {
		return nil, descriptor(err)
	}
	return &entryIdentity{uint64(st.Dev), st.Ino, st.Size, st.Mtim, st.Ctim}, nil
}

func sameIdentity(a, b *entryIdentity) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func assertIdentity(fd int, name string, before *entryIdentity) error {
	after, err := identity(fd, name)
	if err != nil {
		return err
	}
	if !sameIdentity(before, after) {
		return e.New("CONFLICT", "Placement entry changed")
	}
	return nil
}

func linkTarget(fd int, name string) (string, bool) {
	b := make([]byte, 4096)
	n, err := unix.Readlinkat(fd, name, b)
	if err != nil {
		return "", false
	}
	return string(b[:n]), true
}

func readAt(fd int, name string) ([]byte, error) {
	source, err := unix.Openat(fd, name, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK, 0)
	if err != nil {
		return nil, descriptor(err)
	}
	f := os.NewFile(uintptr(source), name)
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !stat.Mode().IsRegular() {
		return nil, e.New("INVALID_INPUT", "Destination is not a file")
	}
	return io.ReadAll(f)
}

func readStore(path string) ([]byte, error) {
	fd, err := unix.Open(path, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), path)
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !st.Mode().IsRegular() {
		return nil, e.New("INVALID_INPUT", "Store source is not a regular file")
	}
	if err = f.Chmod(0600); err != nil {
		return nil, err
	}
	return io.ReadAll(f)
}

func writeAt(fd int, name string, b []byte) error {
	source, err := unix.Openat(fd, name, unix.O_CREAT|unix.O_EXCL|unix.O_NOFOLLOW|unix.O_WRONLY, 0600)
	if err != nil {
		return descriptor(err)
	}
	f := os.NewFile(uintptr(source), name)
	defer f.Close()
	for len(b) > 0 {
		n, err := f.Write(b)
		if err != nil {
			return err
		}
		if n == 0 {
			return e.New("CONFLICT", "Placement write failed")
		}
		b = b[n:]
	}
	return f.Sync()
}
