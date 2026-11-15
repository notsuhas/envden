package pdf

import (
	_ "embed"
	"encoding/json"
	"strconv"
	"strings"
)

//go:embed metrics.json
var metricsJSON []byte

type fontMetric struct {
	Mapping map[string][]any          `json:"mapping"`
	Widths  map[string]int            `json:"widths"`
	Kerns   map[string]map[string]int `json:"kerns"`
}

var fontMetrics = loadMetrics()

func loadMetrics() map[string]fontMetric {
	var result map[string]fontMetric
	if err := json.Unmarshal(metricsJSON, &result); err != nil {
		panic(err) // Invalid embedded font metrics are a build defect.
	}

	return result
}

func printable(value, font string) string {
	return strings.Map(func(r rune) rune {
		if _, ok := fontMetrics[font].Mapping[strconv.Itoa(int(r))]; !ok {
			return '?'
		}

		return r
	}, value)
}

func width(value, font string, size float64) float64 {
	chars := []rune(value)
	metric := fontMetrics[font]
	total := 0
	for i, r := range chars {
		mapping := metric.Mapping[strconv.Itoa(int(r))]
		if mapping == nil {
			mapping = metric.Mapping["63"]
		}

		name := mapping[1].(string)
		total += metric.Widths[name]
		if i+1 < len(chars) {
			next := metric.Mapping[strconv.Itoa(int(chars[i+1]))]
			if next != nil {
				total += metric.Kerns[name][next[1].(string)]
			}
		}
	}

	return float64(total) * (size / 1000)
}

func encodeText(value, font string) string {
	var result strings.Builder
	for _, r := range printable(value, font) {
		mapping := fontMetrics[font].Mapping[strconv.Itoa(int(r))]
		v := int(mapping[0].(float64))
		hex := strings.ToUpper(strconv.FormatInt(int64(v), 16))
		if len(hex) == 1 {
			result.WriteByte('0')
		}

		result.WriteString(hex)
	}

	return result.String()
}
