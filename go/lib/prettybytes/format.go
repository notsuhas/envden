package prettybytes

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

type Options struct{ Binary, Bits, Signed bool }

func Format(value float64, options Options) string {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return ""
	}
	prefix := ""
	if value < 0 {
		prefix = "-"
	} else if options.Signed {
		prefix = "+"
		if value == 0 {
			prefix = " "
		}
	}
	value = math.Abs(value)
	base := 1000.0
	units := []string{"B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"}
	if options.Binary {
		base = 1024
		units = []string{"B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"}
	}
	if options.Bits {
		units = []string{"b", "kbit", "Mbit", "Gbit", "Tbit", "Pbit", "Ebit", "Zbit", "Ybit"}
		if options.Binary {
			units = []string{"b", "kibit", "Mibit", "Gibit", "Tibit", "Pibit", "Eibit", "Zibit", "Yibit"}
		}
	}
	exponent := 0
	if value >= 1 {
		exponent = min(int(math.Floor(math.Log(value)/math.Log(base))), 8)
	}
	value /= math.Pow(base, float64(exponent))
	if value < 1 && exponent > 0 {
		value *= base
		exponent--
	}
	precision := max(3, len(strconv.FormatFloat(math.Floor(value), 'f', 0, 64)))
	value, _ = strconv.ParseFloat(fmt.Sprintf("%.*g", precision, value), 64)
	if value >= base && exponent < 8 {
		value /= base
		exponent++
	}
	number := strconv.FormatFloat(value, 'f', -1, 64)
	if strings.HasPrefix(number, "-0") && value == 0 {
		number = "0"
	}

	return prefix + number + " " + units[exponent]
}
