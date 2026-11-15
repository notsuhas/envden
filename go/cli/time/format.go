package time

import (
	"time"

	"github.com/notsuhas/envden/go/lib/datefns"
)

func LocalTime(utc int64, zone string) (string, error) {
	date := time.UnixMilli(utc).In(time.Local)
	if zone != "" {
		v, err := datefns.InZone(utc, zone)
		if err != nil {
			return "", err
		}

		date = v
	}

	return datefns.Format(date, "yyyy-MM-dd HH:mm zzz"), nil
}

func RelativeTime(utc, now int64) string {
	return datefns.FormatDistanceStrict(time.UnixMilli(utc), time.UnixMilli(now), datefns.DistanceOptions{AddSuffix: true})
}

func WhenText(utc, now int64, zone string) (string, error) {
	local, err := LocalTime(utc, zone)
	if err != nil {
		return "", err
	}

	return RelativeTime(utc, now) + " (" + local + ")", nil
}
