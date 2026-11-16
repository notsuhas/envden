use crate::{
    adapters::IAdapters,
    output::prompts::consent,
    settings::{read_config, set_config},
};
use envden_core::{
    adapters::{IPlacementAdapter, TPlacementMode},
    errors::{EnvdenError, ErrorCode, Result},
};
use std::{
    fs,
    io::{self, IsTerminal},
};

pub fn checkout_placement(adapters: &IAdapters, root: &str, copy: bool) -> Result<TPlacementMode> {
    checkout_placement_with(adapters, root, copy, io::stdin().is_terminal(), &consent)
}

fn checkout_placement_with(
    adapters: &IAdapters,
    root: &str,
    copy: bool,
    interactive: bool,
    ask: &dyn Fn(&str, bool) -> Result<bool>,
) -> Result<TPlacementMode> {
    let config = read_config(&adapters.home)?;
    let configured = config["placement"][root].as_str();
    if copy {
        return save_mode(adapters, root, "copy", &config);
    }
    if let Some(mode) = configured {
        return Ok(if mode == "copy" {
            TPlacementMode::Copy
        } else {
            TPlacementMode::Link
        });
    }
    if interactive {
        let entries = fs::read_dir(root).map_err(crate::state::files::failure)?;
        let container = entries.filter_map(std::result::Result::ok).any(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            e.file_type()
                .is_ok_and(|kind| container_entry(&name, kind.is_dir(), kind.is_file()))
        });
        if container {
            let mode = if confirm_copy(
                "Container configuration detected. Use copy mode for this checkout?",
                ask,
            )? {
                "copy"
            } else {
                "link"
            };
            return save_mode(adapters, root, mode, &config);
        }
    }
    Ok(TPlacementMode::Link)
}

fn save_mode(
    adapters: &IAdapters,
    root: &str,
    mode: &str,
    config: &serde_json::Value,
) -> Result<TPlacementMode> {
    let mut placement = config["placement"].as_object().cloned().unwrap_or_default();
    placement.insert(root.into(), mode.into());
    set_config(
        "placement",
        &serde_json::Value::Object(placement).to_string(),
        &adapters.home,
        &adapters.now,
        io::stdin().is_terminal(),
    )?;
    Ok(if mode == "copy" {
        TPlacementMode::Copy
    } else {
        TPlacementMode::Link
    })
}

pub fn supported_placement(
    adapters: &IAdapters,
    root: &str,
    copy: bool,
) -> Result<Box<dyn IPlacementAdapter>> {
    let mode = checkout_placement(adapters, root, copy)?;
    let placement = adapters.placement(mode, std::path::Path::new(root));
    if mode == TPlacementMode::Copy || placement.supported(root)? {
        return Ok(placement);
    }
    if io::stdin().is_terminal()
        && confirm_copy(
            "Links are unavailable. Use plaintext copy mode for this checkout?",
            &consent,
        )?
    {
        checkout_placement(adapters, root, true)?;
        return Ok(adapters.placement(TPlacementMode::Copy, std::path::Path::new(root)));
    }
    Err(EnvdenError::new(
        ErrorCode::InvalidInput,
        "Links unavailable; explicitly select copy mode to continue",
    ))
}

fn container_entry(name: &str, directory: bool, file: bool) -> bool {
    if name == ".devcontainer" {
        directory
    } else {
        file && (name == "Dockerfile"
            || (name.starts_with("docker-compose")
                && name.ends_with(".yml")
                && !name.contains(['\n', '\r', '\u{2028}', '\u{2029}'])))
    }
}

fn confirm_copy(question: &str, ask: &dyn Fn(&str, bool) -> Result<bool>) -> Result<bool> {
    ask(question, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_mode_consent_defaults_to_no() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("checkout");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("Dockerfile"), b"").unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(temp.path().join("home")),
            temp.path().into(),
            || 42,
        );
        let mode = checkout_placement_with(
            &adapters,
            root.to_str().unwrap(),
            false,
            true,
            &|_, initial| {
                assert!(!initial);
                Ok(false)
            },
        )
        .unwrap();
        assert_eq!(mode, TPlacementMode::Link);
    }

    #[test]
    fn compose_detection_matches_javascript_dot_semantics() {
        assert!(container_entry("docker-compose.dev.yml", false, true));
        for line in ['\n', '\r', '\u{2028}', '\u{2029}'] {
            assert!(!container_entry(
                &format!("docker-compose.a{line}b.yml"),
                false,
                true
            ));
        }
    }
}
