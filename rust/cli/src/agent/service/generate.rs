use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub struct IServiceDefinition {
    pub kind: &'static str,
    pub content: String,
}

fn xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('"', "&quot;")
        .replace('>', "&gt;")
}

fn unit_path(value: &str) -> Result<String> {
    if value.contains(['\r', '\n', '\0']) {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Invalid service path",
        ));
    }
    Ok(value.replace('%', "%%"))
}

fn unit(value: &str) -> Result<String> {
    Ok(format!(
        "\"{}\"",
        unit_path(value)?.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

pub fn service_definition(
    platform: &str,
    executable: &str,
    home: &str,
    log: &str,
    port: u16,
) -> Result<IServiceDefinition> {
    let port = port.to_string();
    let args = [executable, "serve", "--data-dir", home, "--port", &port];
    let (kind, content) = match platform {
        "darwin" => (
            "launchd",
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>com.envden.server</string><key>ProgramArguments</key><array>{}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>{}</string><key>StandardErrorPath</key><string>{}</string></dict></plist>"#,
                args.iter()
                    .map(|s| format!("<string>{}</string>", xml(s)))
                    .collect::<String>(),
                xml(log),
                xml(log)
            ),
        ),
        "linux" => (
            "systemd",
            format!(
                "[Unit]\nDescription=envden server\n[Service]\nExecStart={}\nRestart=on-failure\nStandardOutput=append:{}\nStandardError=append:{}\n[Install]\nWantedBy=default.target\n",
                args.iter()
                    .map(|s| unit(s))
                    .collect::<Result<Vec<_>>>()?
                    .join(" "),
                unit_path(log)?,
                unit_path(log)?
            ),
        ),
        "win32" => {
            let quote = |s: &str| format!("'{}'", s.replace('\'', "''"));
            let script = format!(
                "& {} serve --data-dir {} --port {port} *> {}",
                quote(executable),
                quote(home),
                quote(log)
            );
            (
                "task",
                format!(
                    r#"<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure></Settings><Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>-NoProfile -NonInteractive -Command {}</Arguments></Exec></Actions></Task>"#,
                    xml(&script)
                ),
            )
        }
        _ => {
            return Err(EnvdenError::new(
                ErrorCode::NotImplemented,
                "Login services are unsupported on this platform",
            ));
        }
    };
    Ok(IServiceDefinition { kind, content })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quoting_and_ports() {
        for platform in ["darwin", "linux", "win32"] {
            let definition =
                service_definition(platform, "/bin/env den&", "/data%name", "/log", 51234).unwrap();
            assert_eq!(
                super::super::port::installed_port(&definition.content),
                Some(51234)
            );
        }
        assert!(
            service_definition("darwin", "/bin/env den&", "/data", "/log", 4783)
                .unwrap()
                .content
                .contains("env den&amp;")
        );
        assert!(
            service_definition("linux", "/bin/envden", "/data%name", "/log", 4783)
                .unwrap()
                .content
                .contains("\"/data%%name\"")
        );
        assert!(
            service_definition("linux", "/bin/envden", "/data", "/log\nUser=root", 4783).is_err()
        );
        assert!(service_definition("other", "", "", "", 4783).is_err());
    }
}
