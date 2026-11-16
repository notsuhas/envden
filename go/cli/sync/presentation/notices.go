package presentation

import "strings"

type Notice struct {
	Path, File, Device string
	Keys               []string
	Marked             bool
	Mine, Theirs       string
}

func ConflictNotice(notice Notice) string {
	next := "Run envden resolve " + notice.Path + " with --keep-mine or --take-server, or edit " + notice.File + " first"
	if notice.Marked {
		next = "Edit " + notice.File + ", then run envden resolve " + notice.Path
	}
	where := notice.Device
	if where == "" {
		where = "the server"
	}
	cause := "changed here and on " + where
	switch {
	case notice.Theirs == "absent":
		cause = "this device has two different versions"
	case notice.Theirs == "tombstone":
		cause = "deleted on " + where + " and changed here"
	case notice.Mine == "deleted":
		cause = "deleted here and changed on " + where
	case len(notice.Keys) > 0:
		cause = strings.Join(notice.Keys, ", ") + " changed here and on " + where
	}
	return "Conflict in " + notice.Path + ": " + cause + ". " + next
}
