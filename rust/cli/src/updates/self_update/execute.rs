use super::paths::pinned_install;
use crate::{output::prompts::consent, state::files::failure};
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    process::{ISpawnOptions, TStdio, inside_working_tree, spawn_trusted},
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, fs, path::Path};

pub fn run_command(
    command: &[String],
    env: BTreeMap<String, Option<String>>,
    manager_bin: Option<String>,
) -> Result<()> {
    let child = spawn_trusted(
        &command[0],
        &command[1..],
        &ISpawnOptions {
            env,
            manager_bin,
            stdin: Some(TStdio::Inherit),
            stdout: Some(TStdio::Inherit),
            stderr: Some(TStdio::Inherit),
            ..Default::default()
        },
    )?;
    if !child.wait_with_output().map_err(failure)?.status.success() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Update command failed",
        ));
    }
    Ok(())
}

pub fn post_install(binary: &str, manager_bin: Option<String>) -> Result<()> {
    let env = [
        "ENVDEN_HOME",
        "ENVDEN_NO_UPDATE_CHECK",
        "ENVDEN_TELEMETRY",
        "DO_NOT_TRACK",
    ]
    .into_iter()
    .filter_map(|key| std::env::var(key).ok().map(|v| (key.into(), Some(v))))
    .collect();
    run_command(
        &[binary.into(), "update".into(), "--post-install".into()],
        env,
        manager_bin,
    )
}

pub fn manager_update(command: &[String], binary: &str, now: u64) -> Result<Value> {
    let home = std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok());
    let temp = fs::canonicalize(std::env::temp_dir()).map_err(failure)?;
    if home.as_ref().is_some_and(|h| {
        inside_working_tree(fs::canonicalize(h).unwrap_or_else(|_| h.into()), None)
    }) || inside_working_tree(&temp, None)
    {
        eprintln!(
            "envden: HOME or temp directory is inside a checkout. Run manually: {}",
            command.join(" ")
        );
        return Ok(json!({"kind":"manual"}));
    }
    let Some((manager, binary)) = pinned_install(&command[0], binary) else {
        return manual(command);
    };
    let manager_bin = Path::new(&manager)
        .parent()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let mut absolute = if command[0] == "npm" {
        let windows = manager.as_bytes().get(1) == Some(&b':');
        let node = format!(
            "{manager_bin}/{}",
            if windows { "node.exe" } else { "node" }
        );
        let cli = if windows {
            format!("{manager_bin}/node_modules/npm/bin/npm-cli.js")
        } else {
            format!("{manager_bin}/../lib/node_modules/npm/bin/npm-cli.js")
        };
        if !Path::new(&node).is_file() || !Path::new(&cli).is_file() {
            return manual(command);
        }
        vec![node, cli]
    } else {
        vec![manager]
    };
    absolute.extend_from_slice(&command[1..]);
    if !consent(&format!("Run {}?", absolute.join(" ")), false)? {
        return Ok(json!({"kind":"cancelled"}));
    }
    let directory = temp.join(format!("envden-manager-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&directory).map_err(failure)?;
    let result = (|| {
        if command[0] == "npm" {
            let npmrc = directory.join("npmrc");
            crate::state::files::atomic_write(&npmrc, b"", now)?;
            absolute.extend(["--userconfig".into(), npmrc.to_string_lossy().into_owned()]);
        }
        run_command(&absolute, BTreeMap::new(), Some(manager_bin.clone()))?;
        post_install(&binary, Some(manager_bin))?;
        Ok(json!({"kind":"updated"}))
    })();
    fs::remove_dir_all(directory).map_err(failure)?;
    result
}

fn manual(command: &[String]) -> Result<Value> {
    eprintln!(
        "envden: Cannot pin installer path. Run manually: {}",
        command.join(" ")
    );
    Ok(json!({"kind":"manual"}))
}
