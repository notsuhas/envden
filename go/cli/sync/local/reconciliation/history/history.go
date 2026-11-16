package history

import f "github.com/notsuhas/envden/go/cli/sync/local/files"

func SaveBase(base string, content []byte, now func() int64, writes ...func(string, []byte) error) error {
	if content != nil && len(writes) > 0 && writes[0] != nil {
		old, err := f.ReadBytes(base)
		if err != nil || f.Same(old, content) {
			return err
		}
		return writes[0](base, content)
	}
	return f.WriteBytes(base, content, now)
}
