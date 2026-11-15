package jsonvalue

import (
	"bytes"
	"encoding/json"
	stderrors "errors"
	"io"
)

type Field struct {
	Key   string
	Value any
}

type Object []Field

func (o Object) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, f := range o {
		if i > 0 {
			b.WriteByte(',')
		}

		k, _ := Marshal(f.Key)
		v, err := Marshal(f.Value)
		if err != nil {
			return nil, err
		}

		b.Write(k)
		b.WriteByte(':')
		b.Write(v)
	}

	b.WriteByte('}')

	return b.Bytes(), nil
}

func Marshal(value any) ([]byte, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(value); err != nil {
		return nil, err
	}

	return unescapeSeparators(bytes.TrimSuffix(b.Bytes(), []byte{'\n'})), nil
}

func Parse(data []byte) (any, error) {
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	value, err := read(d)
	if err != nil {
		return nil, err
	}

	if _, err = d.Token(); !stderrors.Is(err, io.EOF) {
		if err == nil {
			err = io.ErrUnexpectedEOF
		}

		return nil, err
	}

	return value, nil
}

func read(d *json.Decoder) (any, error) {
	t, err := d.Token()
	if err != nil {
		return nil, err
	}

	switch t {
	case json.Delim('{'):
		o := Object{}
		for d.More() {
			key, e := d.Token()
			if e != nil {
				return nil, e
			}

			v, e := read(d)
			if e != nil {
				return nil, e
			}

			o.Set(key.(string), v)
		}
		_, err = d.Token()
		return o, err
	case json.Delim('['):
		a := []any{}
		for d.More() {
			v, e := read(d)
			if e != nil {
				return nil, e
			}

			a = append(a, v)
		}
		_, err = d.Token()
		return a, err
	}

	return t, nil
}

func (o Object) Get(key string) any {
	for _, f := range o {
		if f.Key == key {
			return f.Value
		}
	}

	return nil
}

func (o *Object) Set(key string, value any) {
	for i := range *o {
		if (*o)[i].Key == key {
			(*o)[i].Value = value

			return
		}
	}

	*o = append(*o, Field{key, value})
}

func (o *Object) UnmarshalJSON(data []byte) error {
	v, err := Parse(data)
	if err != nil {
		return err
	}

	value, ok := v.(Object)
	if !ok {
		return io.ErrUnexpectedEOF
	}

	*o = value

	return nil
}

func unescapeSeparators(data []byte) []byte {
	result := make([]byte, 0, len(data))
	slashes := 0
	for i := 0; i < len(data); i++ {
		if data[i] == '\\' {
			slashes++
			if slashes%2 == 1 && i+5 < len(data) && (string(data[i:i+6]) == `\u2028` || string(data[i:i+6]) == `\u2029`) {
				if data[i+5] == '8' {
					result = append(result, []byte("\u2028")...)
				} else {
					result = append(result, []byte("\u2029")...)
				}

				i += 5
				slashes = 0
				continue
			}
		} else {
			slashes = 0
		}

		result = append(result, data[i])
	}

	return result
}
