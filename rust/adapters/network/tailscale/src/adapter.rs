use crate::{serve, status};
use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode, Result},
    process::{ISpawnOptions, spawn_trusted},
};

pub struct ICommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}
pub type TRunner = Box<dyn Fn(&[String]) -> Result<ICommandResult> + Send + Sync>;
pub struct TailscaleAdapter {
    runner: TRunner,
}

pub fn create_tailscale_network_adapter(runner: Option<TRunner>) -> TailscaleAdapter {
    TailscaleAdapter {
        runner: runner.unwrap_or_else(|| Box::new(run)),
    }
}

fn run(args: &[String]) -> Result<ICommandResult> {
    let output = spawn_trusted("tailscale", args, &ISpawnOptions::default())?
        .wait_with_output()
        .map_err(|e| {
            EnvdenError::with_source(ErrorCode::Internal, "Tailscale command failed", e)
        })?;
    Ok(ICommandResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

impl TailscaleAdapter {
    fn command(&self, args: &[String], summary: &'static str) -> Result<String> {
        let result = (self.runner)(args)
            .map_err(|e| EnvdenError::with_source(ErrorCode::Internal, summary, e))?;
        if result.exit_code != 0 {
            let detail: String = result.stderr.trim().chars().take(500).collect();
            return Err(EnvdenError::new(
                ErrorCode::Internal,
                if detail.is_empty() {
                    summary.to_owned()
                } else {
                    format!("{summary}: {detail}")
                },
            ));
        }
        Ok(result.stdout)
    }
}

impl INetworkAdapter for TailscaleAdapter {
    fn id(&self) -> &str {
        "tailscale"
    }
    fn status(&self) -> Result<INetworkStatus> {
        let value = match (self.runner)(&["status".into(), "--json".into()]) {
            Ok(v) => v,
            Err(_) => return Ok(status::unavailable(TNetworkProblemKind::NotInstalled)),
        };
        if value.exit_code != 0 {
            return Ok(status::unavailable(TNetworkProblemKind::NotRunning));
        }
        Ok(status::parse(&value.stdout)
            .unwrap_or_else(|| status::unavailable(TNetworkProblemKind::Unreadable)))
    }
    fn check_https_certificate(&self) -> Result<THttpsCheck> {
        Ok(self
            .status()?
            .problem
            .map(THttpsCheck::Problem)
            .unwrap_or(THttpsCheck::Ready))
    }
    fn expose(&self, port: f64) -> Result<String> {
        if !port.is_finite() || port.fract() != 0.0 || !(1.0..=65535.0).contains(&port) {
            return Err(EnvdenError::new(ErrorCode::InvalidInput, "Invalid port"));
        }
        let status = self.status()?;
        if let Some(p) = status.problem {
            return Err(EnvdenError::new(ErrorCode::Conflict, p.message));
        }
        let hostname = status
            .hostname
            .filter(|s| !s.is_empty())
            .ok_or_else(|| EnvdenError::new(ErrorCode::Conflict, "Tailscale is not ready"))?;
        let port = port as u16;
        let target = format!("http://127.0.0.1:{port}");
        let current = self.command(
            &["serve".into(), "status".into(), "--json".into()],
            "Tailscale serve status failed",
        )?;
        if serve::conflict(&current, &hostname, port, &target)? {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                format!(
                    "Tailscale already serves something else on port {port}. See it with tailscale serve status, and remove it with tailscale serve --https={port} off"
                ),
            ));
        }
        self.command(
            &[
                "serve".into(),
                "--bg".into(),
                format!("--https={port}"),
                target,
            ],
            "Tailscale serve failed",
        )?;
        Ok(format!("https://{hostname}:{port}"))
    }
}
