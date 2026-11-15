use super::{
    content::{
        document::report_document,
        issue::{NEW_ISSUE_URL, issue_title, issue_url},
        prompt::agent_prompt,
    },
    facts::report_facts,
    harness::{detect_harnesses, launch_command},
    offer::derive_report_offer,
    write::write_report,
};
use crate::{adapters::IAdapters, output::home_path};
use envden_core::errors::{EnvdenError, Result};
use std::collections::BTreeMap;

pub trait IReportEffects {
    fn env(&self) -> BTreeMap<String, String>;
    fn argv(&self) -> Vec<String>;
    fn interactive(&self) -> bool;
    fn which(&self, command: &str) -> Option<String>;
    fn choose(
        &mut self,
        message: &str,
        options: &[(String, String)],
        initial: &str,
    ) -> Result<String>;
    fn launch(&mut self, command: &[String]) -> Result<()>;
    fn open(&mut self, url: &str) -> bool;
    fn print(&mut self, line: &str);
}

pub fn report_problem(error: &EnvdenError, adapters: &IAdapters, effects: &mut dyn IReportEffects) {
    if let Err(failure) = prepare(error, adapters, effects)
        && failure.message != "Prompt cancelled"
    {
        effects.print("Couldn't prepare the report.");
    }
}

fn prepare(
    error: &EnvdenError,
    adapters: &IAdapters,
    effects: &mut dyn IReportEffects,
) -> Result<()> {
    let argv = effects.argv();
    let command = argv
        .iter()
        .find(|s| !s.starts_with('-'))
        .map(String::as_str);
    if !derive_report_offer(
        Some(error.code),
        command,
        effects.interactive(),
        error.message == "Prompt cancelled",
        &effects.env(),
    ) {
        return Ok(());
    }
    let harnesses = detect_harnesses(|name| effects.which(name));
    let mut options = harnesses
        .iter()
        .map(|h| {
            (
                h.id.into(),
                format!("Ask {} to look into it and draft a GitHub issue", h.name),
            )
        })
        .collect::<Vec<_>>();
    options.extend([
        (
            "browser".into(),
            "Open a pre-filled GitHub issue in the browser".into(),
        ),
        ("no".into(), "No".into()),
    ]);
    let choice = effects.choose("This looks like an envden bug. Report it?", &options, "no")?;
    if choice == "no" {
        return Ok(());
    }
    let facts = report_facts(adapters, error, &argv);
    let document = report_document(&facts);
    let path = write_report(&adapters.home, &document, (adapters.now)())?;
    effects.print(&format!(
        "Report saved to {}",
        home_path(&path, &adapters.user_home)
    ));
    let logs = facts
        .files
        .iter()
        .filter(|(_, exists)| *exists)
        .map(|(p, _)| p.clone())
        .collect::<Vec<_>>();
    if let Some(harness) = harnesses.iter().find(|h| h.id == choice) {
        return effects.launch(&launch_command(
            harness,
            &agent_prompt(&path.to_string_lossy(), &logs),
        ));
    }
    if !effects.open(&issue_url(
        &issue_title(&facts.args, &facts.failure.code),
        &document,
    )) {
        effects.print(&format!(
            "Couldn't open a browser. Open {NEW_ISSUE_URL} and paste the report."
        ));
    }
    Ok(())
}
