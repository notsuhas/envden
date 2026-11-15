package settings

import (
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
)

var names = []string{"telemetry", "update-check", "agent-merge", "auto-approve-worktrees", "unlock-period", "placement", "env-files"}

type Request struct{ Kind, Key, Value, Checkout, Mode string }

func SettingRequest(key *string, values []string) (Request, error) {
	if key == nil {
		return Request{Kind: "list"}, nil
	}

	valid := false
	for _, n := range names {
		if n == *key {
			valid = true
		}
	}

	if !valid {
		return Request{}, errors.New(errors.InvalidInput, "Unknown setting '"+*key+"'. Valid settings: "+strings.Join(names, ", "))
	}

	if len(values) == 0 {
		return Request{Kind: "read", Key: *key}, nil
	}

	value := values[0]
	if *key == "placement" {
		if len(values) != 2 || (values[1] != "link" && values[1] != "copy") {
			return Request{}, errors.New(errors.InvalidInput, "Expected placement <checkout> link|copy")
		}

		return Request{Kind: "placement", Checkout: value, Mode: values[1]}, nil
	}

	if len(values) > 1 {
		return Request{}, errors.New(errors.InvalidInput, "Expected one value for "+*key)
	}

	if *key == "unlock-period" {
		_, err := UnlockPeriod(value)

		return Request{Kind: "unlock-period", Value: value}, err
	}

	if *key != "env-files" && value != "on" && value != "off" {
		return Request{}, errors.New(errors.InvalidInput, "Expected on or off for "+*key)
	}

	return Request{Kind: "set", Key: *key, Value: value}, nil
}

func UnlockPeriod(value string) (*int64, error) {
	var period int64
	switch value {
	case "1d":
		period = 86400000
	case "7d":
		period = 604800000
	case "30d":
		period = 2592000000
	case "never":
		return nil, nil
	default:
		return nil, errors.New(errors.InvalidInput, "Expected 1d, 7d, 30d or never")
	}

	return &period, nil
}
