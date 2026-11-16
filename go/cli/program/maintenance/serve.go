package maintenance

import (
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"syscall"

	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/server"
	"github.com/spf13/cobra"
)

func ServeCommand() *cobra.Command {
	c := command.New("serve", "Run the server; ENVDEN_SETUP_TOKEN replaces the setup token")
	command.AddFlag(c, command.Flag{Syntax: "--restored", Description: "Start a restored backup in repair-only mode"})
	command.AddFlag(c, command.Flag{Syntax: "--min-client <version>", Description: "Oldest client version to accept"})
	command.AddFlag(c, command.Flag{Syntax: "--data-dir <path>", Description: "Server data directory"})
	port := command.Flag{Syntax: "--port <port>", Description: "Localhost port"}
	port.Parse = func(value string) (any, error) { return ParsePort(value) }
	command.AddFlag(c, port)
	command.Action(c, func(i *command.Invocation) error {
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
		return 0, &command.InvalidArgumentError{Message: "Expected a port from 0 (any free port) to 65535."}
	}

	return port, nil
}
