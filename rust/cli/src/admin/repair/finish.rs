use super::{
    completion::{close::close, data, drop::drop_devices, lost::fix_lost},
    context::{invalid, repair_context},
    resume::resume_close,
};
use crate::{
    adapters::IAdapters,
    client::{ITransport, binary, retry_head},
    state::lock::with_state_lock,
    vault::history::read_history,
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::rc::Rc;

pub enum TFinish {
    MissingReports(Vec<String>),
    MissingBlobs {
        missing: Vec<p::IFileName>,
        lost: Vec<p::IFileName>,
    },
    Finished {
        report: Option<String>,
        replace_kit: bool,
    },
}

pub fn finish_repair(
    adapters: &IAdapters,
    token: &str,
    password: &str,
    without: &[String],
    accept_lost: bool,
    transport: Rc<dyn ITransport>,
) -> Result<TFinish> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        retry_head(|| {
            if let Some(result) = resume_close(adapters, token, transport.clone())? {
                return Ok(result);
            }
            let (context, id) = repair_context(adapters, token, transport.clone())?;
            let history = read_history(&context.client, &context.vault_id, None)?;
            let status: p::IRepairStatus = serde_json::from_value(
                context
                    .client
                    .request("/v1/repair/status", "GET", None)?
                    .json()?,
            )
            .map_err(|_| invalid(ErrorCode::InvalidData, "Invalid server response"))?;
            if binary(&status.repair_id)? != id {
                return Err(invalid(ErrorCode::InvalidData, "Repair identity mismatch"));
            }
            let mut history = drop_devices(&context, history, without)?;
            let reports = data::reports(&context, &history, &id)?;
            let missing = c::missing_report_members(&history.state, &reports);
            if !missing.is_empty() {
                let ordered =
                    crate::vault::join::encode_verified_state(&history.state, &history.entries)?;
                let names = ordered["devices"]["$map"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|pair| {
                        missing
                            .iter()
                            .find(|d| Some(p::base32(&d.id).as_str()) == pair[0].as_str())
                            .map(|d| d.name.clone())
                    })
                    .collect();
                return Ok(TFinish::MissingReports(names));
            }
            let files = data::files(&context, &history)?;
            let available = data::available(&context)?;
            let (missing, lost) = c::classify_missing_blobs(&files, &available, &reports);
            if gap_requires_report(missing.len(), lost.len(), accept_lost) {
                return Ok(TFinish::MissingBlobs {
                    missing: data::names(&context, &history, &missing)?,
                    lost: data::names(&context, &history, &lost)?,
                });
            }
            if !lost.is_empty() {
                fix_lost(&context, &history, files, &lost, &available, &id)?;
                history = read_history(&context.client, &context.vault_id, None)?;
            }
            close(adapters, &context, &history, &status, &id, password)?;
            resume_close(adapters, token, transport.clone())?
                .ok_or_else(|| invalid(ErrorCode::InvalidData, "Repair close was not committed"))
        })
    })
}

fn gap_requires_report(missing: usize, lost: usize, accept_lost: bool) -> bool {
    missing > 0 || (lost > 0 && !accept_lost)
}

pub fn repair_text(result: &TFinish) -> String {
    let mut lines = Vec::new();
    let names = |files: &[p::IFileName]| {
        files
            .iter()
            .map(|n| format!("{}/{}", n.repo_id, n.path))
            .collect::<Vec<_>>()
            .join(", ")
    };
    match result {
        TFinish::MissingReports(devices) => {
            lines.push(format!(
                "Waiting for {} to run envden server repair.",
                devices.join(", ")
            ));
            lines.push("Run it on each, or finish without them using --without <device>; they rejoin as new devices.".into());
        }
        TFinish::MissingBlobs { missing, lost } => {
            if !missing.is_empty() {
                lines.push(format!("Waiting for uploads of {}.", names(missing)));
                lines.push(
                    "Run envden server repair on the devices that have them, then finish again."
                        .into(),
                );
            }
            if !lost.is_empty() {
                lines.push(format!(
                    "No device has the newest version of {}.",
                    names(lost)
                ));
                lines.push("Check those files, then finish with --accept-lost to use the newest older version.".into());
            }
        }
        TFinish::Finished {
            report,
            replace_kit,
        } => {
            lines.push("Server restore finished".into());
            if let Some(report) = report.as_ref().filter(|s| !s.is_empty()) {
                lines.push(String::new());
                lines.push(report.clone());
            }
            if *replace_kit {
                lines.push(
                    "The restored server can't vouch for the current recovery kit; replace it."
                        .into(),
                );
            }
        }
    }
    crate::output::sanitize_console(&lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gaps_require_uploads_even_when_accepting_loss() {
        for (missing, lost, accept, expected) in [
            (0, 0, false, false),
            (0, 1, false, true),
            (0, 1, true, false),
            (1, 0, false, true),
            (1, 1, true, true),
        ] {
            assert_eq!(gap_requires_report(missing, lost, accept), expected);
        }
    }
}
