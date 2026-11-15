use super::{failure::IFailure, redact::redact_secrets};

pub struct IReportFacts {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub install: String,
    pub args: Vec<String>,
    pub failure: IFailure,
    pub server_log: Option<String>,
    pub files: Vec<(String, bool)>,
    pub user_home: String,
}

fn fenced(text: &str) -> String {
    format!("~~~\n{}\n~~~", envden_core::text::js_trim_end(text))
}

pub fn report_document(facts: &IReportFacts) -> String {
    let mut lines = vec![
        "# envden problem report".into(),
        String::new(),
        format!("- Version: {}", facts.version),
        format!("- OS: {} ({})", facts.os, facts.arch),
        format!("- Install method: {}", facts.install),
        format!("- Command: envden {}", facts.args.join(" ")),
        String::new(),
        "## Error".into(),
        String::new(),
        format!("- Code: {}", facts.failure.code),
        format!("- Message: {}", facts.failure.message),
    ];
    for cause in &facts.failure.causes {
        lines.push(format!("- Caused by: {cause}"));
    }
    if let Some(stack) = &facts.failure.stack {
        lines.extend([String::new(), fenced(stack)]);
    }
    let tail = facts
        .server_log
        .as_deref()
        .map(envden_core::text::js_trim_end)
        .map(|s| s.split('\n').collect::<Vec<_>>())
        .map(|lines| lines[lines.len().saturating_sub(80)..].join("\n"))
        .filter(|s| !s.is_empty());
    lines.extend([
        String::new(),
        "## Server log (last 80 lines)".into(),
        String::new(),
        tail.map(|s| fenced(&s))
            .unwrap_or_else(|| "No server log.".into()),
        String::new(),
        "## Other files".into(),
        String::new(),
        "Paths only; contents are not included.".into(),
        String::new(),
    ]);
    for (path, exists) in &facts.files {
        lines.push(format!(
            "- {path}{}",
            if *exists { "" } else { " (missing)" }
        ));
    }
    lines.push(String::new());
    let text = lines.join("\n");
    redact_secrets(&if facts.user_home.len() > 1 {
        text.replace(&facts.user_home, "~")
    } else {
        text
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fences_use_javascript_trailing_whitespace() {
        assert_eq!(fenced("line\u{feff}"), "~~~\nline\n~~~");
        assert_eq!(fenced("line\u{85}"), "~~~\nline\u{85}\n~~~");
    }

    #[test]
    fn report_redacts_home_values_and_keeps_only_last_eighty_log_lines() {
        let facts = IReportFacts {
            version: "1.2.3".into(),
            os: "darwin 25.6.0".into(),
            arch: "arm64".into(),
            install: "brew".into(),
            args: vec!["config".into(), "telemetry".into()],
            failure: IFailure {
                code: "INVALID_DATA".into(),
                message: "Unreadable config".into(),
                causes: vec!["JSON Parse error at /home/me/.envden/config.json".into()],
                stack: None,
            },
            server_log: Some(format!(
                "old\n{}\nSECRET=x\n",
                (0..80)
                    .map(|i| format!("line {i}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            )),
            files: vec![
                ("/home/me/.envden/state/".into(), true),
                ("/home/me/unit".into(), false),
            ],
            user_home: "/home/me".into(),
        };
        let document = report_document(&facts);
        assert!(document.contains("~~~\nline 1\n"));
        assert!(document.contains("SECRET=[redacted]\n~~~"));
        assert!(document.contains("- Caused by: JSON Parse error at ~/.envden/config.json"));
        assert!(!document.contains("/home/me"));
        assert!(!document.contains("line 0\n"));
    }
}
