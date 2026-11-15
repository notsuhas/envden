package onboarding

import (
	"io"

	"github.com/notsuhas/envden/go/core/errors"
)

func ConfirmedPassword(prompt func(string) (string, error), attempts int, stderr io.Writer) (string, error) {
	for attempt := 1; attempt <= attempts; attempt++ {
		password, err := prompt("Master password")
		if err != nil {
			return "", err
		}

		confirmation, err := prompt("Confirm master password")
		if err != nil {
			return "", err
		}

		if password != "" && password == confirmation {
			return password, nil
		}

		if attempt < attempts {
			_, _ = io.WriteString(stderr, "The passwords don't match. Enter them again.\n")
		}
	}

	return "", errors.New(errors.InvalidInput, "Master passwords do not match")
}
