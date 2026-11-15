package datefns

import (
	"fmt"
	"math"
	"time"
)

type DistanceOptions struct {
	AddSuffix      bool
	Unit           string
	RoundingMethod string
}

func FormatDistanceStrict(date, base time.Time, options DistanceOptions) string {
	start, end := base, date
	if start.After(end) {
		start, end = end, start
	}
	minutes := float64(end.UnixMilli()-start.UnixMilli()) / 60000
	_, a := start.Zone()
	_, b := end.Zone()
	normalized := minutes + float64(b-a)/60
	unit := options.Unit
	if unit == "" {
		switch {
		case minutes < 1:
			unit = "second"
		case minutes < 60:
			unit = "minute"
		case minutes < 1440:
			unit = "hour"
		case normalized < 43200:
			unit = "day"
		case normalized < 525600:
			unit = "month"
		default:
			unit = "year"
		}
	}
	value := minutes
	switch unit {
	case "second":
		value *= 60
	case "hour":
		value /= 60
	case "day":
		value = normalized / 1440
	case "month":
		value = normalized / 43200
	case "year":
		value = normalized / 525600
	}
	switch options.RoundingMethod {
	case "floor":
		value = math.Floor(value)
	case "ceil":
		value = math.Ceil(value)
	case "trunc":
		value = math.Trunc(value)
	default:
		value = math.Floor(value + 0.5)
	}
	if unit == "month" && value == 12 && options.Unit == "" {
		unit = "year"
		value = 1
	}
	text := fmt.Sprintf("%.0f %s", value, unit)
	if value != 1 {
		text += "s"
	}
	if options.AddSuffix {
		if date.After(base) {
			text = "in " + text
		} else {
			text += " ago"
		}
	}
	return text
}
