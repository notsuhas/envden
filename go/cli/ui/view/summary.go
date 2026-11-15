package view

import "fmt"

func SyncSummary(kind string, changed, conflicts int) string {
	verb := "Pushed"
	if kind == "pull" {
		verb = "Pulled"
	}
	noun := "conflicts"
	if conflicts == 1 {
		noun = "conflict"
	}
	return fmt.Sprintf("%s: %d changed, %d %s.", verb, changed, conflicts, noun)
}
