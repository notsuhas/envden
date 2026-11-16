use crate::{
    edit, profile,
    render::{self, TShell},
};
use envden_core::{adapters::IShellAdapter, errors::Result};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub type TResolveProfile = Box<dyn Fn() -> Option<PathBuf> + Send + Sync>;

pub struct RcShellAdapter {
    shell: TShell,
    home: PathBuf,
    envden_home: String,
    backup: Option<PathBuf>,
    profile: std::sync::OnceLock<PathBuf>,
    resolve_profile: Option<TResolveProfile>,
}

pub fn create_rc_shell_adapter(
    shell: TShell,
    home: impl AsRef<Path>,
    envden_home: Option<&Path>,
    backup: Option<&Path>,
    resolve_profile: Option<TResolveProfile>,
) -> RcShellAdapter {
    let home = home.as_ref().to_owned();
    let envden_home = envden_home
        .map(Path::to_owned)
        .or_else(|| envden_core::paths::envden_home_override(std::env::var_os("ENVDEN_HOME")))
        .unwrap_or_else(|| home.join(".envden"))
        .to_string_lossy()
        .into_owned();
    RcShellAdapter {
        shell,
        home,
        envden_home,
        backup: backup.map(Path::to_owned),
        profile: std::sync::OnceLock::new(),
        resolve_profile,
    }
}

pub(crate) fn strip(value: &str) -> String {
    let start = "# >>> envden >>>";
    let end = "# <<< envden <<<";
    let mut rest = value;
    let mut output = String::new();
    while let Some(i) = rest.find(start) {
        output.push_str(&rest[..i]);
        rest = &rest[i..];
        let after = &rest[start.len()..];
        let offset = if after.starts_with("\r\n") {
            2
        } else if after.starts_with('\n') {
            1
        } else {
            output.push_str(start);
            rest = after;
            continue;
        };
        let body = &after[offset..];
        let finish = body.find(end);
        let nested = body.find(start);
        if let Some(j) = finish.filter(|j| nested.is_none_or(|k| k > *j)) {
            rest = &body[j + end.len()..];
            if rest.starts_with("\r\n") {
                rest = &rest[2..];
            } else if rest.starts_with('\n') {
                rest = &rest[1..];
            }
        } else {
            output.push_str(start);
            rest = after;
        }
    }
    output.push_str(rest);
    output
}

impl IShellAdapter for RcShellAdapter {
    fn id(&self) -> &str {
        self.shell.name()
    }
    fn rc_path(&self) -> Result<String> {
        let path = if matches!(self.shell, TShell::Powershell) {
            self.profile
                .get_or_init(|| {
                    let detected = if let Some(resolve) = &self.resolve_profile {
                        resolve()
                    } else if profile::default_home(
                        std::env::var_os("HOME"),
                        std::env::var_os("USERPROFILE"),
                        cfg!(windows),
                    )
                    .is_some_and(|p| p == self.home)
                    {
                        profile::powershell(&self.home)
                    } else {
                        None
                    };
                    detected.unwrap_or_else(|| profile::powershell_default(&self.home))
                })
                .clone()
        } else {
            profile::profile(self.shell, &self.home)?
        };
        Ok(path.to_string_lossy().into_owned())
    }
    fn hook_snippet(&self, binary: &str) -> Result<String> {
        render::render(self.shell, binary, &self.envden_home)
    }
    fn installed(&self) -> Result<bool> {
        let value = match fs::read(self.rc_path()?) {
            Ok(b) => String::from_utf8_lossy(&b).into_owned(),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(e) => return Err(edit::failure(e)),
        };
        Ok(strip(&value) != value)
    }
    fn install(&self, binary: &str) -> Result<()> {
        edit::edit_fallible(
            Path::new(&self.rc_path()?),
            self.backup.as_deref(),
            |value| {
                let current = strip(value);
                let newline = if value.contains("\r\n") { "\r\n" } else { "\n" };
                let snippet: String = self
                    .hook_snippet(binary)?
                    .replace('\n', newline)
                    .bytes()
                    .map(char::from)
                    .collect();
                Ok(format!(
                    "{current}{}{snippet}",
                    if !current.is_empty() && !current.ends_with('\n') {
                        newline
                    } else {
                        ""
                    }
                ))
            },
            |_| {},
        )
    }
    fn uninstall(&self) -> Result<()> {
        edit::edit(Path::new(&self.rc_path()?), self.backup.as_deref(), strip)
    }
}
