use std::io::{self, IsTerminal, Write};

pub struct IScanProgress {
    label: String,
    enabled: bool,
}

pub fn scan_progress(where_: &str, enabled: Option<bool>) -> IScanProgress {
    let result = IScanProgress {
        label: format!(
            "Looking for repos in {} …",
            super::sanitize_terminal(where_)
        ),
        enabled: enabled.unwrap_or_else(|| io::stdout().is_terminal()),
    };
    result.found(0);
    result
}

impl IScanProgress {
    pub fn found(&self, count: u64) {
        if self.enabled {
            print!("\r\x1b[2K◒  {} {count} found", self.label);
            let _ = io::stdout().flush();
        }
    }
    pub fn done(&self, count: u64) {
        if self.enabled {
            std::println!(
                "\r\x1b[2K◇  Found {count} {} with env files",
                if count == 1 { "repo" } else { "repos" }
            );
        }
    }
    pub fn abort(&self) {
        if self.enabled {
            print!("\r\x1b[2K");
            let _ = io::stdout().flush();
        }
    }
}
