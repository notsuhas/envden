package unlock

import (
	"time"

	"github.com/notsuhas/envden/go/lib/datefns"
)

func UnlockText(unlock Unlock, now int64, date func(int64) string) string {
	fixed := map[string]string{"never": "never expires", "locked": "locked — run envden unlock in a terminal", "unrecorded": "unlocked; expiry not recorded on this device", "unknown": "unknown; the server is unreachable"}
	if unlock.Kind != "until" {
		return fixed[unlock.Kind]
	}

	if unlock.Until <= float64(now) {
		return fixed["locked"]
	}

	return date(int64(unlock.Until)) + " (" + datefns.FormatDistanceStrict(time.UnixMilli(int64(unlock.Until)), time.UnixMilli(now), datefns.DistanceOptions{AddSuffix: true}) + ")"
}
