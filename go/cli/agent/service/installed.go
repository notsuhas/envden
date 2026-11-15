package service

import (
	"encoding/binary"
	"github.com/notsuhas/envden/go/cli/host"
	"os"
	"unicode/utf16"
)

func InstalledServicePort(platform, userHome, home string) *int {
	path := host.ServiceFile(platform, userHome, home)
	if path == "" {
		return nil
	}
	raw, e := os.ReadFile(path)
	if e != nil {
		return nil
	}
	return host.InstalledPort(serviceText(raw, platform))
}
func serviceText(raw []byte, platform string) string {
	utf16Text := platform == "win32" || platform == "windows"
	if len(raw) >= 2 && raw[0] == 255 && raw[1] == 254 {
		raw = raw[2:]
		utf16Text = true
	}
	if !utf16Text {
		return string(raw)
	}
	words := make([]uint16, len(raw)/2)
	for i := range words {
		words[i] = binary.LittleEndian.Uint16(raw[i*2:])
	}
	return string(utf16.Decode(words))
}
