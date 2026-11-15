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
    let config = read_config(&adapters.home)?;
    let configured = config["placement"][root].as_str();
    if copy {
        return save_mode(adapters, root, "copy");
    }
    if let Some(mode) = configured {
        return Ok(if mode == "copy" {
            TPlacementMode::Copy
        } else {
            TPlacementMode::Link
        });
    }
    if io::stdin().is_terminal() {
        let entries = fs::read_dir(root).map_err(crate::state::files::failure)?;
        let container = entries.filter_map(std::result::Result::ok).any(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            e.file_type().is_ok_and(|kind| {
                if name == ".devcontainer" {
                    kind.is_dir()
                } else {
                    kind.is_file()
                        && (name == "Dockerfile"
                            || (name.starts_with("docker-compose") && name.ends_with(".yml")))
                }
            })
        });
        if container {
            let mode = if consent(
                "Container configuration detected. Use copy mode for this checkout?",
                true,
            )? {
                "copy"
            } else {
                "link"
            };
            return save_mode(adapters, root, mode);
        }
    }
    Ok(TPlacementMode::Link)
}

fn save_mode(adapters: &IAdapters, root: &str, mode: &str) -> Result<TPlacementMode> {
    let mut placement = read_config(&adapters.home)?["placement"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    placement.insert(root.into(), mode.into());
    set_config(
        "placement",
        &serde_json::Value::Object(placement).to_string(),
        &adapters.home,
        (adapters.now)(),
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
        && consent(
            "Links are unavailable. Use plaintext copy mode for this checkout?",
            true,
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
