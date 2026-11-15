use envden_core::errors::Result;
use regex::Regex;
use std::path::Path;

pub const DEFAULT_SERVER_PORT: u16 = 4783;

pub trait IPortProbe {
    fn free(&self, port: u16) -> Result<bool>;
    fn envden(&self, port: u16) -> Result<bool>;
    fn any_free(&self) -> Result<u16>;
}

pub fn choose_server_port(probe: &dyn IPortProbe, preferred: Option<u16>) -> Result<u16> {
    let preferred = preferred.unwrap_or(DEFAULT_SERVER_PORT);
    if probe.free(preferred)? || probe.envden(preferred)? {
        return Ok(preferred);
    }
    probe.any_free()
}

pub fn installed_port(definition: &str) -> Option<u16> {
    let re = Regex::new(r#"--port(?:</string><string>|"? "?|\s+)(\d{1,5})"#).unwrap();
    re.captures(definition)
        .and_then(|m| m[1].parse::<u16>().ok())
        .filter(|p| *p > 0)
}

pub fn installed_service_port(platform: &str, user_home: &Path, home: &Path) -> Option<u16> {
    let path = super::location::service_file(platform, user_home, home)?;
    let bytes = std::fs::read(path).ok()?;
    let text = if bytes.starts_with(&[0xff, 0xfe]) || platform == "win32" {
        let bytes = if bytes.starts_with(&[0xff, 0xfe]) {
            &bytes[2..]
        } else {
            &bytes
        };
        String::from_utf16_lossy(
            &bytes
                .as_chunks::<2>()
                .0
                .iter()
                .map(|b| u16::from_le_bytes([b[0], b[1]]))
                .collect::<Vec<_>>(),
        )
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };
    installed_port(&text)
}
