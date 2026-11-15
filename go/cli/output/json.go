package output

import (
	"github.com/notsuhas/envden/go/cli/jsonvalue"
)

func TerminalJSON(value any) (string, error) {
	raw, err := jsonvalue.Marshal(value)
	if err != nil {
		return "", err
	}
	v, err := jsonvalue.Parse(raw)
	if err != nil {
		return "", err
	}
	raw, err = jsonvalue.Marshal(sanitizeValue(v))
	return string(raw), err
}
func sanitizeValue(v any) any {
	switch x := v.(type) {
	case string:
		return SanitizeTerminal(x)
	case jsonvalue.Object:
		for i := range x {
			x[i].Value = sanitizeValue(x[i].Value)
		}
		return x
	case []any:
		for i := range x {
			x[i] = sanitizeValue(x[i])
		}
		return x
	default:
		return v
	}
}
