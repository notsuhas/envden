package time

import (
	"fmt"
	"time"
)

func LocalTime(utc int64, zone string) (string, error) {
	date := time.UnixMilli(utc).In(time.Local)
	if zone != "" {
		location, err := time.LoadLocation(zone)
		if err != nil {
			return "", err
		}

		date = date.In(location)
	}

	_, offset := date.Zone()
	sign := "+"
	if offset < 0 {
		sign = "-"
		offset = -offset
	}
	zoneText := fmt.Sprintf("GMT%s%d", sign, offset/3600)
	if offset%3600 != 0 {
		zoneText += fmt.Sprintf(":%02d", offset/60%60)
	}

	return date.Format("2006-01-02 15:04 ") + zoneText, nil
}

func RelativeTime(utc, now int64) string {
	date, base := time.UnixMilli(utc), time.UnixMilli(now)
	distance := date.Sub(base).Abs().Round(time.Second).String()
	if date.After(base) {
		return "in " + distance
	}

	return distance + " ago"
}

func WhenText(utc, now int64, zone string) (string, error) {
	local, err := LocalTime(utc, zone)
	if err != nil {
		return "", err
	}

	return RelativeTime(utc, now) + " (" + local + ")", nil
}
