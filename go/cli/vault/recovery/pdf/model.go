package pdf

import (
	"github.com/notsuhas/envden/go/cli/time"
)

type Field struct {
	Label, Value string
	Large        bool
}
type Document struct {
	Title           string
	Details, Fields []Field
	Instructions    []string
	Footer          string
}

func KitDocument(vaultID, secretKey, server, deviceName string, now int64) (Document, error) {
	date, err := time.LocalTime(now, "")
	if err != nil {
		return Document{}, err
	}
	return Document{Title: "envden Recovery Kit", Details: []Field{{Label: "Created", Value: date}, {Label: "Device", Value: deviceName}}, Fields: []Field{{Label: "Vault ID", Value: vaultID}, {Label: "Secret key", Value: secretKey, Large: true}, {Label: "Server", Value: server}}, Instructions: []string{"To get back in on a new device: run envden join " + server + " --recovery, enter the vault ID and secret key above, then your master password.", "Keep this offline, like a passport. Never write your master password on it.", "Anyone with this kit and your master password can open the vault."}, Footer: "https://envden.theclau.de"}, nil
}
