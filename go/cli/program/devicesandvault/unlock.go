package devicesandvault

import "github.com/notsuhas/envden/go/lib/commander"

func UnlockCommand() *commander.Command {
	c := commander.New("unlock").Description("Log in with your master password to restart the unlock period")
	c.Action(unlockAction)
	return c
}
