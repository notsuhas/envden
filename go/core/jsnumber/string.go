package jsnumber

import (
	"math"
	"strconv"
	"strings"
)

func String(value float64) string {
	if math.IsNaN(value) {
		return "NaN"
	}
	if math.IsInf(value, 1) {
		return "Infinity"
	}
	if math.IsInf(value, -1) {
		return "-Infinity"
	}
	if value == 0 {
		return "0"
	}

	magnitude := math.Abs(value)
	if magnitude >= 1e-6 && magnitude < 1e21 {
		return strconv.FormatFloat(value, 'f', -1, 64)
	}

	result := strconv.FormatFloat(value, 'e', -1, 64)
	mantissa, exponent, _ := strings.Cut(result, "e")
	sign := exponent[:1]
	exponent = strings.TrimLeft(exponent[1:], "0")

	return mantissa + "e" + sign + exponent
}
