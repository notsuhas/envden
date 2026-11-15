use super::run::{IReportEffects, report_problem};
use crate::{adapters::IAdapters, output::prompts::choose};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    collections::BTreeMap,
    io::{self, IsTerminal},
    process::Command,
};

struct Effects;

impl IReportEffects for Effects {
    fn env(&self) -> BTreeMap<String, String> {
        std::env::vars().collect()
    }
    fn argv(&self) -> Vec<String> {
        std::env::args().skip(1).collect()
    }
    fn interactive(&self) -> bool {
        io::stdin().is_terminal() && io::stdout().is_terminal()
    }
    fn which(&self, command: &str) -> Option<String> {
        let path = std::env::var_os("PATH")?;
        std::env::split_paths(&path)
            .map(|p| p.join(command))
            .find(|p| p.is_file())
            .map(|p| p.to_string_lossy().into_owned())
    }
    fn choose(
        &mut self,
        message: &str,
        options: &[(String, String)],
        initial: &str,
    ) -> Result<String> {
        choose(message, options, Some(initial))
    }
    fn launch(&mut self, command: &[String]) -> Result<()> {
        let Some((program, args)) = command.split_first() else {
            return Ok(());
        };
        let mut child = Command::new(program).args(args).spawn().map_err(|e| {
            EnvdenError::with_source(ErrorCode::Internal, "Cannot launch coding agent", e)
        })?;
        let runtime = tokio::runtime::Runtime::new().map_err(|e| {
            EnvdenError::with_source(ErrorCode::Internal, "Cannot launch coding agent", e)
        })?;
        runtime.block_on(async {
            let wait = tokio::task::spawn_blocking(move || child.wait());
            tokio::pin!(wait);
            loop {
                tokio::select! {
                    result = &mut wait => {
                        result.map_err(|e| EnvdenError::with_source(ErrorCode::Internal, "Cannot launch coding agent", e))?.map_err(|e| EnvdenError::with_source(ErrorCode::Internal, "Cannot launch coding agent", e))?;
                        break;
                    },
                    _ = tokio::signal::ctrl_c() => {}
                }
            }
            Ok::<(), EnvdenError>(())
        })?;
        Ok(())
    }
    fn open(&mut self, url: &str) -> bool {
        crate::ui::browser::open_browser(url)
    }
    fn print(&mut self, line: &str) {
        eprintln!("{line}");
    }
}

pub fn offer_report(error: &EnvdenError, adapters: &IAdapters) {
    report_problem(error, adapters, &mut Effects);
}
