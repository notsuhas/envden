package paths

import "testing"

func TestPlacement(t *testing.T) {
	for _, row := range [][3]string{{"/repos", "/repos", "root"}, {"/repos", "/repos/", "root"}, {"/repos", "/repos/a", "inside"}, {"/repos", "/repos/..cache", "inside"}, {"/repos", "/repos/a/../b", "inside"}, {"/repos", "/", "outside"}, {"/repos", "/repos-other", "outside"}, {"/repos", "/repos/../x", "outside"}} {
		if got := PlaceInRoot(row[0], row[1]); got != row[2] {
			t.Error(row, got)
		}
	}
	for _, row := range [][3]string{{`C:\repos`, `C:\repos`, "root"}, {`C:\repos`, `c:/repos/a`, "inside"}, {`C:\repos`, `C:\repos\..cache`, "inside"}, {`C:\repos`, `C:\`, "outside"}, {`C:\repos`, `C:\repos\..\x`, "outside"}, {`C:\repos`, `D:\repos\a`, "outside"}, {`C:\repos`, `\\server\share\repos`, "outside"}} {
		if got := PlaceInRootWindows(row[0], row[1]); got != row[2] {
			t.Error(row, got)
		}
	}
}
