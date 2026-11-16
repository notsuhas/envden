package ui

import (
	"context"
	stderrors "errors"
	"net"
	"net/http"
	"strconv"

	"github.com/notsuhas/envden/go/cli/ui/routes"
	"github.com/notsuhas/envden/go/cli/ui/server"
	"github.com/notsuhas/envden/go/cli/ui/server/assets"
	"github.com/notsuhas/envden/go/core/errors"
)

type DashboardOptions struct {
	Interactive bool
	Port        *int
	Report      func(string)
	Open        func(string) bool
	Actions     routes.Actions
}

type Result struct {
	Kind string `json:"kind"`
}

func RunDashboard(ctx context.Context, options DashboardOptions) (Result, error) {
	if !options.Interactive {
		return Result{}, errors.New(errors.InvalidInput, "envden ui needs an interactive terminal")
	}

	port := 0
	if options.Port != nil {
		port = *options.Port
		if port < 1 || port > 65535 {
			return Result{}, errors.New(errors.InvalidInput, "Port must be 1-65535")
		}
	}

	token, err := server.NewToken()
	if err != nil {
		return Result{}, err
	}

	page, err := assets.PageAssets()
	if err != nil {
		return Result{}, err
	}

	listener, err := net.Listen("tcp4", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		return Result{}, err
	}

	port = listener.Addr().(*net.TCPAddr).Port
	app := &http.Server{Handler: server.CreateDashboardApp(server.Dashboard{Token: token, Port: port, Assets: page, Actions: options.Actions}), ReadHeaderTimeout: idleTimeout, IdleTimeout: idleTimeout}
	defer func() { _ = app.Close() }() // Best-effort cleanup must not replace the operation result.
	done := make(chan error, 1)
	go func() { done <- app.Serve(dashboardListener{listener}) }()
	url := "http://127.0.0.1:" + strconv.Itoa(port) + "/#" + token
	if options.Report != nil {
		options.Report("envden ui: " + url)
		options.Report("Press Ctrl-C to stop.")
	}

	if options.Open != nil && !options.Open(url) && options.Report != nil {
		options.Report("Could not open a browser; open the link above.")
	}

	select {
	case <-ctx.Done():
		return Result{Kind: "stopped"}, nil
	case err := <-done:
		if stderrors.Is(err, http.ErrServerClosed) {
			return Result{Kind: "stopped"}, nil
		}
		return Result{}, err
	}
}
