package content

import (
	"strings"
)

type File struct {
	Path   string
	Exists bool
}
type Facts struct {
	Version, OS, Arch, Install string
	Args                       []string
	Failure                    Failure
	ServerLog                  *string
	Files                      []File
	UserHome                   string
}

func fenced(text string) string { return "~~~\n" + strings.TrimRight(text, " \t\r\n") + "\n~~~" }
func ReportDocument(f Facts) string {
	lines := []string{"# envden problem report", "", "- Version: " + f.Version, "- OS: " + f.OS + " (" + f.Arch + ")", "- Install method: " + f.Install, "- Command: envden " + strings.Join(f.Args, " "), "", "## Error", "", "- Code: " + f.Failure.Code, "- Message: " + f.Failure.Message}
	for _, c := range f.Failure.Causes {
		lines = append(lines, "- Caused by: "+c)
	}
	if f.Failure.Stack != "" {
		lines = append(lines, "", fenced(f.Failure.Stack))
	}
	lines = append(lines, "", "## Server log (last 80 lines)", "")
	tail := ""
	if f.ServerLog != nil {
		parts := strings.Split(strings.TrimRight(*f.ServerLog, " \r\n\t"), "\n")
		if len(parts) > 80 {
			parts = parts[len(parts)-80:]
		}
		tail = strings.Join(parts, "\n")
	}
	if tail != "" {
		lines = append(lines, fenced(tail))
	} else {
		lines = append(lines, "No server log.")
	}
	lines = append(lines, "", "## Other files", "", "Paths only; contents are not included.", "")
	for _, file := range f.Files {
		suffix := ""
		if !file.Exists {
			suffix = " (missing)"
		}
		lines = append(lines, "- "+file.Path+suffix)
	}
	lines = append(lines, "")
	doc := strings.Join(lines, "\n")
	if len(f.UserHome) > 1 {
		doc = strings.ReplaceAll(doc, f.UserHome, "~")
	}
	return RedactSecrets(doc)
}
