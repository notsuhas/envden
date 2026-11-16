package maintenance

import (
	"context"
	"math"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/ui"
	dashboardactions "github.com/notsuhas/envden/go/cli/ui/actions"
	"github.com/notsuhas/envden/go/cli/ui/routes"
	"github.com/notsuhas/envden/go/cli/ui/routes/inputs"
	"github.com/notsuhas/envden/go/cli/ui/view/status"
	"github.com/notsuhas/envden/go/core/textcase"
	"github.com/spf13/cobra"
)

func UiCommand(actions ...routes.Actions) *cobra.Command {
	c := command.New("ui", "Open a local dashboard for this device")
	command.AddFlag(c, command.Flag{Syntax: "--port <port>", Description: "Port on 127.0.0.1 (default: random)", Parse: func(raw string) (any, error) { return number(raw), nil }})
	command.AddFlag(c, command.Flag{Syntax: "--no-open", Description: "Print the link without opening a browser"})
	command.Action(c, func(i *command.Invocation) error {
		env, err := runtime.Get(i)
		if err != nil {
			return err
		}

		options := ui.DashboardOptions{Interactive: env.Interactive, Report: func(line string) { _ = runtime.Print(i, line) }}
		if value, ok := i.Values["port"].(float64); ok {
			port := -1
			if value >= 1 && value <= 65535 && value == math.Trunc(value) {
				port = int(value)
			}
			options.Port = &port
		}

		if open, ok := i.Values["open"].(bool); !ok || open {
			options.Open = ui.OpenBrowser
		}

		if len(actions) > 0 {
			options.Actions = actions[0]
		} else {
			options.Actions = dashboardactions.CreateDashboardActions(env.Adapters, env.Adapters.Now)
		}

		if options.Actions.Status == nil {
			options.Actions.Status = func(ctx context.Context, _ inputs.Input) (any, error) {
				return status.DashboardStatus(ctx, env.Adapters, status.Sources{})
			}
		}

		ctx, stop := signal.NotifyContext(env.Context, os.Interrupt, syscall.SIGTERM)
		defer stop()
		_, err = ui.RunDashboard(ctx, options)

		return err
	})

	return c
}

func number(raw string) float64 {
	text := textcase.Trim(raw)
	if text == "" {
		return 0
	}
	value, err := strconv.ParseFloat(text, 64)
	if strings.HasPrefix(strings.ToLower(text), "0x") || strings.HasPrefix(strings.ToLower(text), "0o") || strings.HasPrefix(strings.ToLower(text), "0b") {
		n, e := strconv.ParseInt(text, 0, 64)
		value, err = float64(n), e
	}

	if err != nil {
		return math.NaN()
	}
	return value
}
