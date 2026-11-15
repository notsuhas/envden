package lock

import (
	"github.com/google/uuid"
	"github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
)

type Timing struct {
	Now    func() int64
	Wait   func(int64) error
	Delays []int64
}

func AcquireLock(path string, timing Timing) error {
	for attempt := 0; ; attempt++ {
		ok, err := tryAcquire(path, timing.Now())
		if err != nil {
			return err
		}
		if ok {
			return nil
		}
		if attempt >= len(timing.Delays) {
			return errors.New(errors.Conflict, "State is locked; retry after the other command finishes")
		}
		if err := timing.Wait(timing.Delays[attempt]); err != nil {
			return err
		}
	}
}

func tryAcquire(path string, now int64) (bool, error) {
	err := os.Mkdir(path, 0700)
	if err == nil {
		return true, nil
	}
	if !os.IsExist(err) {
		return false, err
	}
	s, err := os.Lstat(path)
	if err != nil || !s.IsDir() {
		return false, nil
	}
	previous := ReadOwner(path)
	expired := false
	if previous == nil {
		_, err = os.Lstat(filepath.Join(path, "owner.json"))
		expired = os.IsNotExist(err) && now-s.ModTime().UnixMilli() >= 30000
	} else {
		identity := ProcessIdentity()
		observed := Process{Kind: "unknown"}
		if identity != "" && identity == previous.Identity {
			observed = ProcessStart(previous.PID)
		}
		expired = Reclaimable(*previous, observed, identity, now)
	}
	if !expired {
		return false, nil
	}
	token := ""
	if previous != nil {
		token = previous.Token
	}
	ok, err := ReclaimLock(path, token, now, nil)
	if err != nil || !ok {
		return false, err
	}
	return tryAcquire(path, now)
}

func ReclaimLock(path, token string, now int64, beforeRename func() error) (bool, error) {
	guard := filepath.Join(path, "reclaim")
	if err := os.Mkdir(guard, 0777); err != nil {
		s, e := os.Lstat(guard)
		if e != nil || now-s.ModTime().UnixMilli() < 30000 {
			return false, nil
		}
		if err = os.RemoveAll(guard); err != nil {
			return false, err
		}
		return ReclaimLock(path, token, now, beforeRename)
	}
	if ownerToken(path) != token {
		os.RemoveAll(guard)
		return false, nil
	}
	if beforeRename != nil {
		if err := beforeRename(); err != nil {
			return false, err
		}
	}
	abandoned := path + "." + uuid.NewString() + ".abandoned"
	if err := os.Rename(path, abandoned); err != nil {
		return false, err
	}
	if ownerToken(abandoned) != token {
		if err := os.Rename(abandoned, path); err != nil {
			return false, err
		}
		os.RemoveAll(guard)
		return false, nil
	}
	return true, os.RemoveAll(abandoned)
}

func ownerToken(path string) string {
	if o := ReadOwner(path); o != nil {
		return o.Token
	}
	return ""
}
