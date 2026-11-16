use std::io::{self, IsTerminal};

pub struct IScanProgress {
    label: String,
    indicator: Option<cliclack::ProgressBar>,
}

pub fn scan_progress(where_: &str, enabled: Option<bool>) -> IScanProgress {
    let label = format!(
        "Looking for repos in {} …",
        super::sanitize_terminal(where_)
    );
    let indicator = enabled
        .unwrap_or_else(|| io::stdout().is_terminal())
        .then(|| {
            let spinner = cliclack::spinner();
            spinner.start(format!("{label} 0 found"));
            spinner
        });

    IScanProgress { label, indicator }
}

impl IScanProgress {
    pub fn found(&self, count: u64) {
        if let Some(indicator) = &self.indicator {
            indicator.set_message(format!("{} {count} found", self.label));
        }
    }

    pub fn done(&self, count: u64) {
        if let Some(indicator) = &self.indicator {
            indicator.clear();
            println!(
                "Found {count} {} with env files",
                if count == 1 { "repo" } else { "repos" }
            );
        }
    }

    pub fn abort(&self) {
        if let Some(indicator) = &self.indicator {
            indicator.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_progress_never_creates_a_spinner() {
        let progress = scan_progress("fixture", Some(false));
        progress.found(2);
        progress.done(2);
        progress.abort();
        assert!(progress.indicator.is_none());
    }
}
