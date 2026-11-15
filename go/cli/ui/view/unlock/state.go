package unlock

type Unlock struct {
	Kind  string `json:"kind"`
	Until int64  `json:"until,omitempty"`
}
type Probe struct {
	Kind   string
	Period *int64
}

func DeriveUnlock(recorded *int64, recordedPresent bool, probe Probe, now int64) Unlock {
	if probe.Kind == "locked" {
		return Unlock{Kind: "locked"}
	}
	if probe.Kind == "unlocked" {
		if probe.Period == nil {
			return Unlock{Kind: "never"}
		}
		if recorded != nil && *recorded > now {
			return Unlock{"until", *recorded}
		}
		return Unlock{Kind: "unrecorded"}
	}
	if recordedPresent && recorded == nil {
		return Unlock{Kind: "never"}
	}
	if !recordedPresent {
		return Unlock{Kind: "unknown"}
	}
	if *recorded > now {
		return Unlock{"until", *recorded}
	}
	return Unlock{Kind: "locked"}
}
