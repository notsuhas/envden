use crate::{
    adapters::IAdapters,
    output::{print, sanitize_terminal, terminal_json},
    program::IInvocation,
    sync::remove::remove_file,
};
use envden_core::errors::Result;
use std::{
    io::{self, IsTerminal},
    path::Path,
};

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let json = invocation.options.get("json") == Some(&true.into());
    let cwd = std::env::current_dir().map_err(crate::state::files::failure)?;
    let path =
        crate::links::takeover::sibling::normalize(&cwd.join(Path::new(&invocation.arguments[0])));
    let result = remove_file(
        adapters,
        &path,
        invocation.options.get("yes") == Some(&true.into()),
        io::stdin().is_terminal(),
        &|m| {
            if json {
                eprintln!("{}", sanitize_terminal(m));
            } else {
                print(&sanitize_terminal(m));
            }
        },
    )?;
    if json {
        print(&terminal_json(&result));
    } else {
        for skipped in result["skipped"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|s| s.as_str())
        {
            print(&sanitize_terminal(&format!(
                "Skipped {skipped}: run envden track to approve this checkout"
            )));
        }
        print(if result["kind"] == "blocked" {
            "Removal held back; approve the skipped checkout first"
        } else if result["publish"] == "next-push" {
            "Removed locally; run envden push to delete everywhere"
        } else {
            "Removed unpublished file locally"
        });
    }
    Ok(())
}
