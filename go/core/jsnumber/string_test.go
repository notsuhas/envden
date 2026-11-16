package jsnumber

import (
	"math"
	"testing"
)

func TestNumberToString(t *testing.T) {
	for _, row := range []struct {
		value float64
		want  string
	}{
		{0, "0"}, {math.Copysign(0, -1), "0"}, {1e-7, "1e-7"}, {1e-6, "0.000001"}, {1e20, "100000000000000000000"}, {1e21, "1e+21"}, {1e23, "1e+23"}, {-1.234e22, "-1.234e+22"}, {1000000000000000128, "1000000000000000100"}, {math.NaN(), "NaN"}, {math.Inf(1), "Infinity"}, {math.Inf(-1), "-Infinity"}, {math.SmallestNonzeroFloat64, "5e-324"}, {math.MaxFloat64, "1.7976931348623157e+308"},
	} {
		if got := String(row.value); got != row.want {
			t.Fatalf("%g: %s want %s", row.value, got, row.want)
		}
	}
}
