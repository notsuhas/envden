use crate::{
    adapters::create_adapters,
    report::{
        content::issue::NEW_ISSUE_URL,
        run::{IReportEffects, report_problem},
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::collections::BTreeMap;

struct Effects {
    choice: &'static str,
    env: BTreeMap<String, String>,
    offered: Vec<String>,
    launched: Vec<Vec<String>>,
    opened: Vec<String>,
    printed: Vec<String>,
}

impl IReportEffects for Effects {
    fn env(&self) -> BTreeMap<String, String> {
        self.env.clone()
    }
    fn argv(&self) -> Vec<String> {
        vec![
            "join".into(),
            "--setup-token".into(),
            "043GE1R70W3GE1R70W3GE1R70W3GE1R70W4GJ289144GJ289144GJ289144GJ289144GJ289144GJ289144GJ"
                .into(),
        ]
    }
    fn interactive(&self) -> bool {
        true
    }
    fn which(&self, command: &str) -> Option<String> {
        (command == "claude").then(|| "/bin/claude".into())
    }
    fn choose(&mut self, _: &str, options: &[(String, String)], _: &str) -> Result<String> {
        self.offered = options.iter().map(|o| o.1.clone()).collect();
        if self.choice == "cancel" {
            return Err(EnvdenError::new(ErrorCode::InvalidInput, "Cancelled"));
        }
        Ok(self.choice.into())
    }
    fn launch(&mut self, command: &[String]) -> Result<()> {
        self.launched.push(command.to_vec());
        Ok(())
    }
    fn open(&mut self, url: &str) -> bool {
        self.opened.push(url.into());
        false
    }
    fn print(&mut self, line: &str) {
        self.printed.push(line.into());
    }
}

#[test]
fn report_agent_browser_decline_cancel_and_environment() {
    for choice in ["claude", "browser", "no", "cancel", "inside-agent"] {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().join(".envden")), dir.path().into(), || 0);
        std::fs::create_dir_all(&adapters.home).unwrap();
        let mut effects = Effects {
            choice: if choice == "inside-agent" {
                "claude"
            } else {
                choice
            },
            env: if choice == "inside-agent" {
                BTreeMap::from([("CLAUDECODE".into(), "1".into())])
            } else {
                BTreeMap::new()
            },
            offered: vec![],
            launched: vec![],
            opened: vec![],
            printed: vec![],
        };
        let token = effects.argv()[2].clone();
        std::fs::write(
            adapters.home.join("server.log"),
            format!("Setup token:\n  {token}\nenvden listening\n"),
        )
        .unwrap();
        report_problem(
            &EnvdenError::new(ErrorCode::InvalidData, "Unreadable config"),
            &adapters,
            &mut effects,
        );
        let report = adapters.home.join("reports/1970-01-01T00-00-00-000Z.md");
        if matches!(choice, "no" | "cancel" | "inside-agent") {
            assert!(!report.exists());
            assert!(effects.printed.is_empty());
            if choice == "inside-agent" {
                assert!(effects.offered.is_empty());
            }
            continue;
        }
        let document = std::fs::read_to_string(&report).unwrap();
        assert!(document.contains("- Command: envden join --setup-token [redacted]"));
        assert!(document.contains("~~~\nSetup token:\n  [setup token]\nenvden listening\n~~~"));
        assert!(!document.contains(&token));
        assert_eq!(effects.offered.len(), 3);
        assert!(effects.offered[0].contains("Claude Code"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&report).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                std::fs::metadata(report.parent().unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
        }
        if choice == "claude" {
            assert_eq!(effects.launched[0][0], "/bin/claude");
            assert!(
                effects.launched[0][1].contains(&format!("report is at {}.", report.display()))
            );
        } else {
            let url = url::Url::parse(&effects.opened[0]).unwrap();
            assert!(
                url.query_pairs()
                    .any(|(k, v)| k == "title" && v == "envden join fails with INVALID_DATA")
            );
            assert!(effects.printed.last().unwrap().contains(NEW_ISSUE_URL));
        }
    }
}
