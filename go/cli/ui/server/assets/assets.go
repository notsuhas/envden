package assets

import (
	"embed"
	"strings"
)

//go:embed *.html *.js *.css
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

		name := e.Name()
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

		body, err := bundled.ReadFile(name)
		if err != nil {
			return nil, err
		}

		result[route] = PageAsset{body, kind}
	}

	return result, nil
}
