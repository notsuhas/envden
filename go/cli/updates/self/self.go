package self

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/updates"
	"github.com/notsuhas/envden/go/cli/updates/check"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/process"
	"io"
	"path/filepath"
	"runtime"
)

type Options struct {
	Binary, Platform string
	Env              map[string]string
	Run              func([]string) error
	Confirm          func(string) (bool, error)
	Stderr           io.Writer
	Manager          func([]string, string) (check.Result, error)
}

func ReleasePlatform(platform, arch, glibc string) string {
	if platform == "win32" {
		platform = "windows"
	}
	suffix := ""
	if platform == "linux" && glibc == "" {
		suffix = "-musl"
	}
	return platform + "-" + arch + suffix
}
func SelfUpdate(ctx context.Context, a contracts.Adapters, o Options) (result check.Result, err error) {
	acquired := false
	timing := a.Timing
	timing.Delays = []int64{}
	timing.Wait = func(int64) error { return nil }
	err = lock.WithStateLock(ctx, filepath.Join(a.Home, "state", "update"), timing, func(context.Context) error { acquired = true; var e error; result, e = update(ctx, a, o); return e })
	if !acquired && errors.Is(err, errors.Conflict) {
		err = errors.New(errors.Conflict, "Another envden update is running")
	}
	return
}
func update(ctx context.Context, a contracts.Adapters, o Options) (check.Result, error) {
	method, e := updates.InstallMethod(a.Home, "", o.Binary, o.Env)
	if e != nil {
		return check.Result{}, e
	}
	if method.Kind == "manager" {
		if o.Manager != nil {
			return o.Manager(method.Command, o.Binary)
		}
		return ManagerUpdate(method.Command, o.Binary, o)
	}
	switch filepath.Base(o.Binary) {
	case "bun", "node", "bun.exe", "node.exe":
		return check.Result{}, errors.New(errors.InvalidInput, "Self-update requires the installed envden binary")
	}
	platform := o.Platform
	if platform == "" {
		arch := runtime.GOARCH
		if arch == "amd64" {
			arch = "x64"
		}
		platform = ReleasePlatform(runtime.GOOS, arch, "glibc")
	}
	bytes, e := DownloadUpdate(ctx, a.Fetcher, version.Version, platform)
	if e != nil {
		if _, ok := errors.As(e); !ok {
			e = errors.Wrap(errors.InvalidData, "Release download failed", e)
		}
		return check.Result{}, e
	}
	if bytes == nil {
		return check.Result{Kind: "current"}, nil
	}
	run := o.Run
	if run == nil {
		run = func(command []string) error {
			_, e := process.ExecTrusted(command[0], command[1:], process.Options{Env: postInstallEnvironment(o.Env), Stdin: "inherit", Stdout: "inherit", Stderr: "inherit"})
			return e
		}
	}
	e = updates.ReplaceBinary(o.Binary, bytes, runtime.GOOS == "windows", func(path string) error {
		if o.Run != nil {
			return run([]string{path, "--version"})
		}
		_, e := process.ExecTrusted(path, []string{"--version"}, process.Options{Stdout: "ignore", Stderr: "ignore"})
		return e
	}, func() error { return run([]string{o.Binary, "update", "--post-install"}) }, a.Now)
	return check.Result{Kind: "updated"}, e
}
