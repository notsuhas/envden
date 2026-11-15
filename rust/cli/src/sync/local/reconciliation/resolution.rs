use crate::output::sanitize_terminal;
use envden_core::{errors::Result, merge::merge_env};

type TConfirm<'a> = &'a dyn Fn(&[String]) -> Result<bool>;
type TChoose<'a> = &'a dyn Fn(&str) -> Result<String>;

pub enum TResolution {
    Conflict,
    Write(Option<Vec<u8>>),
}

pub struct IResolutionOptions<'a> {
    pub interactive: Option<bool>,
    pub yes: bool,
    pub report: Option<&'a dyn Fn(&str)>,
    pub confirm: Option<TConfirm<'a>>,
}

pub struct IResolutionInput<'a> {
    pub path: &'a str,
    pub mine: Option<&'a [u8]>,
    pub server: Option<&'a [u8]>,
    pub previous: Option<&'a [u8]>,
    pub choose: Option<TChoose<'a>>,
    pub default_content: Option<&'a [u8]>,
}

pub fn resolve_content(
    options: &IResolutionOptions<'_>,
    input: IResolutionInput<'_>,
) -> Result<TResolution> {
    let IResolutionInput {
        path,
        mine,
        server,
        previous,
        choose,
        default_content,
    } = input;
    if options.interactive == Some(false) && choose.is_some() {
        return Ok(TResolution::Conflict);
    }
    let choice = choose
        .map(|c| c(path))
        .transpose()?
        .unwrap_or_else(|| "merge".into());
    if choice == "keep-mine" {
        return Ok(TResolution::Write(mine.map(<[u8]>::to_vec)));
    }
    if choice == "take-server" {
        return Ok(TResolution::Write(default_content.map(<[u8]>::to_vec)));
    }
    let merged = previous
        .zip(mine)
        .zip(server)
        .and_then(|((base, local), remote)| merge_env(base, local, remote).ok());
    let Some(merged) = merged else {
        return Ok(TResolution::Conflict);
    };
    if let Some(report) = options.report {
        report(&sanitize_terminal(&format!(
            "Merge {path}: {}",
            merged.changed_keys.join(", ")
        )));
    }
    if !options.yes
        && (options.interactive == Some(false)
            || !options
                .confirm
                .map(|c| c(&merged.changed_keys))
                .transpose()?
                .unwrap_or(false))
    {
        return Ok(TResolution::Conflict);
    }
    if let Some(report) = options.report {
        report(&sanitize_terminal(&format!(
            "Merged {path}: {}",
            merged.changed_keys.join(", ")
        )));
    }
    Ok(TResolution::Write(Some(merged.bytes)))
}
