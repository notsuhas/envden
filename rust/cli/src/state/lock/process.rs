use super::owner::TProcess;

pub(super) fn process_start(pid: u32) -> TProcess {
    #[cfg(windows)]
    {
        return super::windows::process_start(pid);
    }
    #[cfg(unix)]
    {
        if let Some(start) = start_time(pid) {
            return TProcess::Live(start);
        }
        let Ok(pid) = i32::try_from(pid) else {
            return TProcess::Unknown;
        };
        if pid <= 0 {
            return TProcess::Unknown;
        }
        match nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid), None) {
            Err(nix::errno::Errno::ESRCH) => TProcess::Dead,
            _ => TProcess::Unknown,
        }
    }
}

#[cfg(unix)]
fn start_time(pid: u32) -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        super::owner::linux_start(&std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let output = std::process::Command::new("/bin/ps")
            .args(["-p", &pid.to_string(), "-o", "lstart="])
            .env("LC_ALL", "C")
            .output()
            .ok()?;
        let value = String::from_utf8(output.stdout).ok()?.trim().to_owned();
        (!value.is_empty()).then_some(value)
    }
}
