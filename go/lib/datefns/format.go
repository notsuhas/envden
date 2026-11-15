package datefns

import (
	"fmt"
	"strings"
	"time"
)

const (
	MillisecondsInSecond int64 = 1000
	MillisecondsInMinute       = 60 * MillisecondsInSecond
	MillisecondsInHour         = 60 * MillisecondsInMinute
	MillisecondsInDay          = 24 * MillisecondsInHour
	MillisecondsInWeek         = 7 * MillisecondsInDay
)

func Format(date time.Time, pattern string) string {
	_, offset := date.Zone()
	sign := "+"
	if offset < 0 {
		sign = "-"
		offset = -offset
	}
	zone := fmt.Sprintf("GMT%s%d", sign, offset/3600)
	if offset%3600 != 0 {
		zone += fmt.Sprintf(":%02d", offset/60%60)
	}
	replacements := map[string]string{
		"yyyy": fmt.Sprintf("%04d", date.Year()), "MM": date.Format("01"), "dd": date.Format("02"),
		"HH": date.Format("15"), "mm": date.Format("04"), "zzz": zone,
		"PP": date.Format("Jan 2, 2006"), "p": date.Format("3:04 PM"),
	}
	var result strings.Builder
	for len(pattern) > 0 {
		if pattern[0] == '\'' {
			pattern = pattern[1:]
			for len(pattern) > 0 && pattern[0] != '\'' {
				result.WriteByte(pattern[0])
				pattern = pattern[1:]
			}
			if len(pattern) > 0 {
				pattern = pattern[1:]
			}
			continue
		}
		matched := false
		for _, token := range []string{"yyyy", "zzz", "MM", "dd", "HH", "mm", "PP", "p"} {
			if strings.HasPrefix(pattern, token) {
				result.WriteString(replacements[token])
				pattern = pattern[len(token):]
				matched = true
				break
			}
		}
		if !matched {
			result.WriteByte(pattern[0])
			pattern = pattern[1:]
		}
	}

	return result.String()
}

func InZone(ms int64, zone string) (time.Time, error) {
	location, err := time.LoadLocation(zone)
	if err != nil {
		return time.Time{}, err
	}

	return time.UnixMilli(ms).In(location), nil
}
