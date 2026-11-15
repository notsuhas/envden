package datefns

import (
	"fmt"
	"math"
	"strings"
	"time"
)

type Duration struct{ Years, Months, Weeks, Days, Hours, Minutes, Seconds float64 }

func Milliseconds(d Duration) int64 {
	days := d.Years*365.2425 + d.Months*(365.2425/12) + d.Weeks*7 + d.Days
	seconds := days*24*60*60 + d.Hours*3600 + d.Minutes*60 + d.Seconds
	return int64(math.Trunc(seconds * 1000))
}

func IntervalToDuration(start, end time.Time) Duration {
	var d Duration
	direction := 1
	if end.Before(start) {
		direction = -1
	}
	years := end.Year() - start.Year()
	if direction > 0 && start.AddDate(years, 0, 0).After(end) {
		years--
	}
	if direction < 0 && start.AddDate(years, 0, 0).Before(end) {
		years++
	}
	start = addMonths(start, years*12)
	d.Years = float64(years)
	months := (end.Year()-start.Year())*12 + int(end.Month()-start.Month())
	if direction > 0 && addMonths(start, months).After(end) {
		months--
	}
	if direction < 0 && addMonths(start, months).Before(end) {
		months++
	}
	start = addMonths(start, months)
	d.Months = float64(months)
	days := int(end.Sub(start).Hours() / 24)
	for direction > 0 && start.AddDate(0, 0, days+1).Compare(end) <= 0 {
		days++
	}
	for direction < 0 && start.AddDate(0, 0, days-1).Compare(end) >= 0 {
		days--
	}
	start = start.AddDate(0, 0, days)
	d.Days = float64(days)
	seconds := int64(end.Sub(start).Seconds())
	d.Hours = float64(seconds / 3600)
	seconds %= 3600
	d.Minutes = float64(seconds / 60)
	d.Seconds = float64(seconds % 60)
	return d
}

func addMonths(t time.Time, months int) time.Time {
	first := time.Date(t.Year(), t.Month()+time.Month(months), 1, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
	last := first.AddDate(0, 1, -1).Day()
	day := min(t.Day(), last)
	return first.AddDate(0, 0, day-1)
}

func FormatDuration(d Duration, units ...string) string {
	if len(units) == 0 {
		units = []string{"years", "months", "weeks", "days", "hours", "minutes", "seconds"}
	}
	values := map[string]float64{"years": d.Years, "months": d.Months, "weeks": d.Weeks, "days": d.Days, "hours": d.Hours, "minutes": d.Minutes, "seconds": d.Seconds}
	var parts []string
	for _, unit := range units {
		value := values[unit]
		if value == 0 {
			continue
		}
		if value == 1 {
			unit = strings.TrimSuffix(unit, "s")
		}
		parts = append(parts, fmt.Sprintf("%g %s", value, unit))
	}
	return strings.Join(parts, " ")
}
