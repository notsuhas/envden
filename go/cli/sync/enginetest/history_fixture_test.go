package enginetest

import (
	"time"

	historylist "github.com/notsuhas/envden/go/cli/history/list"
)

func expectedHistoryVersions() []historylist.Version {
	return []historylist.Version{
		{Version: 3, Kind: "live", Time: time.UnixMilli(clock() + 120000).UTC().Format("2006-01-02T15:04:05.000Z"), Device: "second", Changes: historylist.KeyChanges{Added: []string{}, Changed: []string{"TOKEN"}, Removed: []string{}}},
		{Version: 2, Kind: "live", Time: time.UnixMilli(clock() + 60000).UTC().Format("2006-01-02T15:04:05.000Z"), Device: "first", Changes: historylist.KeyChanges{Added: []string{"DB_URL"}, Changed: []string{}, Removed: []string{}}},
		{Version: 1, Kind: "live", Time: time.UnixMilli(clock()).UTC().Format("2006-01-02T15:04:05.000Z"), Device: "first", Changes: historylist.KeyChanges{Added: []string{"TOKEN"}, Changed: []string{}, Removed: []string{}}},
	}
}
