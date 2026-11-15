package sqlite

import (
	"database/sql"
	"runtime"
)

type persistWALControl interface {
	FileControlPersistWAL(dbName string, mode int) (int, error)
}

// persistsWAL mirrors Bun: on macOS it links Apple's SQLite, which keeps -wal and -shm after close.
func persistsWAL(goos string) bool {
	return goos == "darwin"
}

func applyWALPersistence(conn *sql.Conn) error {
	if !persistsWAL(runtime.GOOS) {
		return nil
	}

	return conn.Raw(func(driverConn any) error {
		control, ok := driverConn.(persistWALControl)
		if !ok {
			return nil
		}

		_, err := control.FileControlPersistWAL("main", 1)

		return err
	})
}
