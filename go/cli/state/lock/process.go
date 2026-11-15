package lock

import (
	"encoding/json"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/core/process"
)

type Process struct {
	Kind      string
	StartedAt string
}

func LinuxStart(stat string) string {
	end := strings.LastIndex(stat, ")")
	if end < 0 {
		return ""
	}

	fields := strings.Fields(stat[end+1:])
	if len(fields) <= 19 {
		return ""
	}

	if !regexp.MustCompile(`^\d+$`).MatchString(fields[19]) {
		return ""
	}

	return fields[19]
}

func ProcessStart(pid int) Process {
	if runtime.GOOS == "windows" {
		return windowsStart(pid)
	}

	var started string
	if runtime.GOOS == "linux" {
		data, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")
		if err == nil {
			started = LinuxStart(string(data))
		}
	} else {
		result, err := process.ExecTrusted("ps", []string{"-p", strconv.Itoa(pid), "-o", "lstart="}, process.Options{Env: map[string]string{"LC_ALL": "C"}})
		if err == nil {
			started = strings.TrimSpace(result.Stdout)
		}
	}

	if started != "" {
		return Process{"live", started}
	}

	if dead(pid) {
		return Process{Kind: "dead"}
	}

	return Process{Kind: "unknown"}
}

func ProcessIdentity() string {
	host, err := os.Hostname()
	if err != nil {
		return ""
	}

	boot, namespace := "", ""
	switch runtime.GOOS {
	case "linux":
		b, e := os.ReadFile("/proc/sys/kernel/random/boot_id")
		if e != nil {
			return ""
		}
		boot = strings.TrimSpace(string(b))
		namespace, e = os.Readlink("/proc/self/ns/pid")
		if e != nil {
			return ""
		}
	case "darwin":
		result, e := process.ExecTrusted("sysctl", []string{"-n", "kern.boottime"}, process.Options{})
		b := []byte(result.Stdout)
		if e != nil {
			return ""
		}
		m := regexp.MustCompile(`sec\s*=\s*(\d+),\s*usec\s*=\s*(\d+)`).FindStringSubmatch(string(b))
		if len(m) < 3 {
			return ""
		}
		boot = m[1] + ":" + m[2]
	}

	if runtime.GOOS == "windows" {
		result, e := process.ExecTrusted("powershell", []string{"-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().Ticks"}, process.Options{})
		if e != nil {
			return ""
		}

		boot = strings.TrimSpace(result.Stdout)
	}

	if boot == "" {
		return ""
	}

	b, _ := json.Marshal(struct {
		Host      string `json:"host"`
		Boot      string `json:"boot"`
		Namespace string `json:"namespace"`
	}{host, boot, namespace})

	return string(b)
}
