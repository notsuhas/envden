package query

import (
	"net/url"
	"strings"
)

func Values(raw string) url.Values {
	values := url.Values{}
	for _, pair := range strings.Split(raw, "&") {
		if pair == "" {
			continue
		}
		key, value, _ := strings.Cut(pair, "=")
		key = decode(key)
		value = decode(value)
		values.Add(key, value)
	}
	return values
}
func decode(s string) string {
	v, err := url.QueryUnescape(s)
	if err == nil {
		return v
	}
	return strings.ReplaceAll(s, "+", " ")
}
