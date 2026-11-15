use super::trust::trusted_directories;
use std::collections::BTreeMap;
pub fn sanitized_environment(
    extra: &BTreeMap<String, Option<String>>,
    inherited: &BTreeMap<String, String>,
    manager_bin: Option<&str>,
) -> BTreeMap<String, String> {
    let allowed = [
        "home",
        "xdg_config_home",
        "user",
        "logname",
        "lang",
        "term",
        "tmpdir",
        "tmp",
        "temp",
        "systemroot",
        "systemdrive",
        "windir",
        "comspec",
        "pathext",
        "userprofile",
        "appdata",
        "localappdata",
        "programdata",
        "programfiles",
        "programfiles(x86)",
        "homedrive",
        "homepath",
    ];
    let mut env = BTreeMap::new();
    for (key, value) in inherited {
        let lower = key.to_lowercase();
        if allowed.contains(&lower.as_str()) || lower.starts_with("lc_") {
            env.insert(key.clone(), value.clone());
        }
    }
    for (key, value) in extra {
        if key.to_uppercase() != "PATH"
            && let Some(value) = value
        {
            env.insert(key.clone(), value.clone());
        }
    }
    env.insert(
        "PATH".into(),
        trusted_directories(None, manager_bin).join(if cfg!(windows) { ";" } else { ":" }),
    );
    env
}
