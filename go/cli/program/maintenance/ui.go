package maintenance

import (
	"context"
	"math"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/ui"
	dashboardactions "github.com/notsuhas/envden/go/cli/ui/actions"
	"github.com/notsuhas/envden/go/cli/ui/routes"
	"github.com/notsuhas/envden/go/cli/ui/routes/inputs"
	"github.com/notsuhas/envden/go/cli/ui/view/status"
	"github.com/notsuhas/envden/go/lib/commander"
)

func UiCommand(actions ...routes.Actions) *commander.Command {
	c := commander.New("ui").Description("Open a local dashboard for this device")
	c.AddOption(commander.NewOption("--port <port>", "Port on 127.0.0.1 (default: random)"))
	c.AddOption(commander.NewOption("--no-open", "Print the link without opening a browser"))
	c.Action(func(i *commander.Invocation) error {
		env, err := runtime.Get(i)
		if err != nil {
			return err
		}

		options := ui.DashboardOptions{Interactive: env.Interactive, Report: func(line string) { _ = runtime.Print(i, line) }}
		if raw, ok := i.Values["port"].(string); ok {
			port := dashboardPort(raw)
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

func dashboardPort(raw string) int {
	text := strings.TrimSpace(raw)
	value, err := strconv.ParseFloat(text, 64)
	if strings.HasPrefix(strings.ToLower(text), "0x") || strings.HasPrefix(strings.ToLower(text), "0o") || strings.HasPrefix(strings.ToLower(text), "0b") {
		n, e := strconv.ParseInt(text, 0, 64)
		value, err = float64(n), e
	}

	if err != nil || math.IsNaN(value) || value < 1 || value > 65535 || value != math.Trunc(value) {
		return -1
	}

	return int(value)
}
