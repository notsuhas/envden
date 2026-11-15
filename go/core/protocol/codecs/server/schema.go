package server

import (
	"bytes"
	"encoding/json"
	"io"
	"math"
	"regexp"
	"unicode/utf16"

	e "github.com/notsuhas/envden/go/core/errors"
)

type rule func(any) bool
type field struct {
	validate rule
	optional bool
}
type Schema[T any] struct{ validate rule }

func (s Schema[T]) Decode(raw []byte) (out T, err error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err = dec.Decode(&v); err != nil {
		return out, e.Wrap(e.InvalidData, "Invalid protocol data", err)
	}
	if dec.Decode(new(any)) != io.EOF || !s.validate(v) {
		return out, e.New(e.InvalidData, "Invalid protocol data")
	}
	normalized, _ := json.Marshal(normalizeNumbers(v))
	err = json.Unmarshal(normalized, &out)
	return
}

func object(fields map[string]field) rule {
	return func(v any) bool {
		m, ok := v.(map[string]any)
		if !ok {
			return false
		}
		for k := range m {
			if _, ok := fields[k]; !ok {
				return false
			}
		}
		for k, f := range fields {
			x, ok := m[k]
			if !ok {
				if f.optional {
					continue
				}
				return false
			}
			if !f.validate(x) {
				return false
			}
		}
		return true
	}
}

func req(r rule) field { return field{validate: r} }

func optional(r rule) field { return field{validate: r, optional: true} }

func nullable(r rule) rule { return func(v any) bool { return v == nil || r(v) } }

func stringValue(v any) bool {
	_, ok := v.(string)

	return ok
}

func boolValue(v any) bool {
	_, ok := v.(bool)

	return ok
}

func integer(v any) bool {
	x, ok := v.(json.Number)
	if !ok {
		return false
	}
	n, err := x.Float64()

	return err == nil && math.Trunc(n) == n && math.Abs(n) <= 9007199254740991
}

func count(v any) bool {
	if !integer(v) {
		return false
	}
	n, _ := v.(json.Number).Float64()

	return n >= 0
}

func enum(values ...string) rule {
	return func(v any) bool {
		s, ok := v.(string)
		if !ok {
			return false
		}
		for _, x := range values {
			if s == x {
				return true
			}
		}
		return false
	}
}

func union(rules ...rule) rule {
	return func(v any) bool {
		for _, r := range rules {
			if r(v) {
				return true
			}
		}
		return false
	}
}

func array(item rule) rule {
	return func(v any) bool {
		a, ok := v.([]any)
		if !ok {
			return false
		}
		for _, x := range a {
			if !item(x) {
				return false
			}
		}
		return true
	}
}

func maxString(n int) rule {
	return func(v any) bool {
		s, ok := v.(string)

		return ok && len(utf16.Encode([]rune(s))) <= n
	}
}

var binaryChars = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func binaryString(n int) rule {
	return func(v any) bool {
		s, ok := v.(string)

		return ok && len(s) <= (n*4+2)/3 && binaryChars.MatchString(s)
	}
}

func Decode[T any](s Schema[T], raw []byte) (T, error) { return s.Decode(raw) }

func normalizeNumbers(v any) any {
	switch x := v.(type) {
	case json.Number:
		n, _ := x.Float64()

		return int64(n)
	case map[string]any:
		for k, v := range x {
			x[k] = normalizeNumbers(v)
		}
	case []any:
		for i, v := range x {
			x[i] = normalizeNumbers(v)
		}
	}

	return v
}
