package release

import (
	"context"
	"encoding/json"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/versions"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func Latest(ctx context.Context, fetch func(*http.Request) (*http.Response, error)) (string, error) {
	baseContext := ctx
	ctx, cancel := context.WithTimeout(baseContext, 2*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, "GET", "https://github.com/notsuhas/envden/releases/latest", nil)
	if err != nil {
		return "", err
	}
	response, err := fetch(request)
	if err == nil {
		location := response.Header.Get("Location")
		response.Body.Close()
		if response.StatusCode >= 300 && response.StatusCode < 400 && location != "" {
			base, _ := url.Parse("https://github.com")
			ref, e := url.Parse(location)
			if e == nil {
				u := base.ResolveReference(ref)
				prefix := "/notsuhas/envden/releases/tag/"
				if u.Scheme == "https" && u.Host == "github.com" && strings.HasPrefix(u.Path, prefix) {
					return tagVersion(strings.TrimPrefix(u.Path, prefix))
				}
			}
		}
	}
	fallbackContext, fallbackCancel := context.WithTimeout(baseContext, 2*time.Second)
	defer fallbackCancel()
	request, err = http.NewRequestWithContext(fallbackContext, "GET", "https://api.github.com/repos/notsuhas/envden/releases/latest", nil)
	if err != nil {
		return "", err
	}
	response, err = fetch(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", errors.New(errors.InvalidData, "Latest release lookup failed")
	}
	var value struct {
		Tag *string `json:"tag_name"`
	}
	if json.NewDecoder(response.Body).Decode(&value) != nil || value.Tag == nil {
		return "", errors.New(errors.InvalidData, "Invalid release response")
	}
	return tagVersion(*value.Tag)
}
func tagVersion(tag string) (string, error) {
	if !strings.HasPrefix(tag, "v") {
		return "", errors.New(errors.InvalidData, "Invalid release tag")
	}
	value := tag[1:]
	if _, err := versions.ParseSemver(value); err != nil {
		return "", errors.Wrap(errors.InvalidData, "Invalid release tag", err)
	}
	return value, nil
}
