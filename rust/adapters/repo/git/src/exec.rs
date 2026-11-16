use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    process::{ISpawnOptions, TStdio, spawn_trusted},
};
use std::{collections::BTreeMap, path::PathBuf, process::Output};

#[cfg(test)]
thread_local! {
    pub(crate) static CALLS: std::cell::RefCell<Vec<(Vec<String>, Option<String>)>> = const { std::cell::RefCell::new(Vec::new()) };
}

#[derive(Debug)]
pub(crate) struct Exit(pub i32);
impl std::fmt::Display for Exit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Git command failed")
    }
}
impl std::error::Error for Exit {}

pub(crate) fn exit(error: &EnvdenError) -> Option<i32> {
    error.source.as_ref()?.downcast_ref::<Exit>().map(|e| e.0)
}

pub(crate) fn failure(e: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "Repository operation failed", e)
}

fn run(
    args: &[String],
    env: BTreeMap<String, Option<String>>,
    input: Option<&str>,
    home: Option<&str>,
) -> Result<Output> {
    let mut env = env;
    if let Some(home) = home {
        env.insert("HOME".into(), Some(home.into()));
        env.insert(
            "XDG_CONFIG_HOME".into(),
            Some(
                PathBuf::from(home)
                    .join(".config")
                    .to_string_lossy()
                    .into_owned(),
            ),
        );
    }
    #[cfg(test)]
    CALLS.with(|calls| {
        calls.borrow_mut().push((
            args.to_vec(),
            env.get("GIT_CONFIG_GLOBAL").cloned().flatten(),
        ))
    });
    let result = spawn_trusted(
        "git",
        args,
        &ISpawnOptions {
            env,
            stdin: input.map(|s| TStdio::Bytes(s.as_bytes().to_vec())),
            ..Default::default()
        },
    )?
    .wait_with_output()
    .map_err(failure)?;
    if !result.status.success() {
        return Err(EnvdenError::with_source(
            ErrorCode::InvalidInput,
            "Subprocess failed",
            Exit(result.status.code().unwrap_or(-1)),
        ));
    }
    Ok(result)
}

pub(crate) fn global(pattern: &str, home: Option<&str>) -> Result<Vec<(String, String)>> {
    let result = run(
        &["config", "--global", "--null", "--get-regexp", pattern].map(str::to_owned),
        BTreeMap::from([("GIT_CONFIG_NOSYSTEM".into(), Some("1".into()))]),
        None,
        home,
    );
    match result {
        Ok(output) => Ok(String::from_utf8_lossy(&output.stdout)
            .split('\0')
            .filter_map(|e| e.split_once('\n').map(|(k, v)| (k.into(), v.into())))
            .collect()),
        Err(e) if exit(&e) == Some(1) => Ok(Vec::new()),
        Err(e) => Err(e),
    }
}

pub(crate) fn git(
    root: &str,
    args: &[&str],
    input: Option<&str>,
    rewrites: bool,
    home: Option<&str>,
) -> Result<String> {
    git_with_config(root, args, input, rewrites, home, None)
}

pub(crate) fn git_with_config(
    root: &str,
    args: &[&str],
    input: Option<&str>,
    rewrites: bool,
    home: Option<&str>,
    safe: Option<&[(String, String)]>,
) -> Result<String> {
    let rewrites = if rewrites {
        global("^url\\..*\\.insteadof$", home)?
    } else {
        Vec::new()
    };
    let mut command = Vec::new();
    for config in [
        "safe.bareRepository=explicit",
        "core.fsmonitor=false",
        "core.untrackedCache=false",
        "core.hooksPath=/dev/null",
        "core.pager=cat",
        "protocol.allow=never",
        "diff.external=",
        "core.sshCommand=false",
        "core.attributesFile=/dev/null",
    ] {
        command.extend(["-c".into(), config.into()]);
    }
    let safe = match safe {
        Some(config) => config.to_vec(),
        None => global("^safe\\.directory$", home)?,
    };
    for (key, value) in safe {
        command.extend(["-c".into(), format!("{key}={value}")]);
    }
    if args.first() == Some(&"ls-files") {
        command.push("--literal-pathspecs".into());
    }
    command.extend(["-C".into(), root.into()]);
    command.extend(args.iter().map(|s| (*s).into()));
    let mut env = BTreeMap::new();
    for (key, value) in [
        ("GIT_TERMINAL_PROMPT", "0"),
        ("GIT_OPTIONAL_LOCKS", "0"),
        ("GIT_PAGER", "cat"),
        ("GIT_CONFIG_NOSYSTEM", "1"),
    ] {
        env.insert(key.into(), Some(value.into()));
    }
    env.insert("GIT_CONFIG_GLOBAL".into(), Some("/dev/null".into()));
    if !rewrites.is_empty() {
        let config = rewrites;
        if !config.is_empty() {
            env.insert("GIT_CONFIG_COUNT".into(), Some(config.len().to_string()));
        }
        for (i, (key, value)) in config.into_iter().enumerate() {
            env.insert(format!("GIT_CONFIG_KEY_{i}"), Some(key));
            env.insert(format!("GIT_CONFIG_VALUE_{i}"), Some(value));
        }
    }
    Ok(String::from_utf8_lossy(&run(&command, env, input, home)?.stdout).into_owned())
}
