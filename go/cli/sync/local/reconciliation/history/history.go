package history

import f "github.com/notsuhas/envden/go/cli/sync/local/files"

func SaveBase(base string, content []byte, now func() int64) error {
	return f.WriteBytes(base, content, now)
}
