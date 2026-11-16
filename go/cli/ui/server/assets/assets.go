package assets

import (
	"bytes"
	"compress/gzip"
	"embed"
	"io"
	"strings"
)

//go:embed *.gz
var bundled embed.FS

type PageAsset struct {
	Body []byte
	Type string
}

func PageAssets() (map[string]PageAsset, error) {
	entries, err := bundled.ReadDir(".")
	if err != nil {
		return nil, err
	}

	result := map[string]PageAsset{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}

		name := strings.TrimSuffix(e.Name(), ".gz")
		kind := ""
		route := "/" + name
		switch {
		case strings.HasSuffix(name, ".html"):
			kind = "text/html;charset=utf-8"
			route = "/"
		case strings.HasSuffix(name, ".css"):
			kind = "text/css;charset=utf-8"
		case strings.HasSuffix(name, ".js"):
			kind = "text/javascript;charset=utf-8"
		default:
			continue
		}

		body, err := bundled.ReadFile(e.Name())
		if err != nil {
			return nil, err
		}

		reader, err := gzip.NewReader(bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		decoded, err := io.ReadAll(reader)
		_ = reader.Close()
		if err != nil {
			return nil, err
		}
		result[route] = PageAsset{decoded, kind}
	}

	return result, nil
}
