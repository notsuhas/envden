package maintenance

import (
	"errors"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"syscall"

	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/lib/commander"
	"github.com/notsuhas/envden/go/server"
)

func ServeCommand() *commander.Command {
	c := commander.New("serve").Description("Run the server; ENVDEN_SETUP_TOKEN replaces the setup token")
	c.AddOption(commander.NewOption("--restored", "Start a restored backup in repair-only mode"))
	c.AddOption(commander.NewOption("--min-client <version>", "Oldest client version to accept"))
	c.AddOption(commander.NewOption("--data-dir <path>", "Server data directory"))
	port := commander.NewOption("--port <port>", "Localhost port")
	port.Parse = func(value string) (any, error) { return ParsePort(value) }
	c.AddOption(port)
	c.Action(func(i *commander.Invocation) error {
		str := func(k string) string { v, _ := i.Values[k].(string); return v }
		token := os.Getenv("ENVDEN_SETUP_TOKEN")
		_ = os.Unsetenv("ENVDEN_SETUP_TOKEN") // Best-effort cleanup preserves the original operation result.
		o := server.ServeOptions{DataDir: str("dataDir"), MinClient: str("minClient"), SetupToken: token, Restored: i.Values["restored"] == true, Stdout: runtime.Writer(i.Command, false), Stderr: runtime.Writer(i.Command, true)}
		if p, ok := i.Values["port"].(int); ok {
			o.Port = &p
		}

		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
		defer signal.Stop(stop)
		running, e := server.Serve(o)
		if e != nil {
			return e
		}

		<-stop

		return running.Shutdown()
	})

	return c
}

func ParsePort(value string) (int, error) {
	port, e := strconv.Atoi(value)
	if e != nil || !regexp.MustCompile(`^[0-9]{1,5}$`).MatchString(value) || port < 0 || port > 65535 {
		return 0, errors.New("Expected a port from 0 (any free port) to 65535.") //nolint:staticcheck // Preserve the exact TS error text.
	}

	return port, nil
}
