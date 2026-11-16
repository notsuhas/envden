use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    output::{print, terminal_json},
    program::IInvocation,
    status::{render::status_text, report::status_report},
};
use envden_core::errors::Result;
use envden_core::filesystem::ICanonicalPath;
use std::rc::Rc;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let cwd = std::env::current_dir().map_err(crate::state::files::failure)?;
    let refresh = invocation.options.get("refreshCache") == Some(&true.into());
    if refresh {
        crate::notice::command::command_notice(
            adapters,
            (adapters.now)(),
            &crate::updates::fetch::HttpFetcher,
            true,
            cwd.to_str(),
            false,
        );
        return Ok(());
    }
    let report = status_report(adapters, Rc::new(UreqTransport))?;
    crate::notice::command::command_notice(
        adapters,
        (adapters.now)(),
        &crate::updates::fetch::HttpFetcher,
        false,
        cwd.to_str(),
        true,
    );
    print(&render_report(
        &report,
        invocation.options.get("json") == Some(&true.into()),
        &cwd,
        &adapters.user_home,
    ));
    Ok(())
}

fn render_report(
    report: &serde_json::Value,
    json: bool,
    cwd: &std::path::Path,
    user_home: &std::path::Path,
) -> String {
    if json {
        terminal_json(report)
    } else {
        let home = user_home
            .canonical_path()
            .unwrap_or_else(|_| user_home.to_owned());
        status_text(report, cwd, &home)
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn display_uses_real_user_home_for_canonical_checkout_roots() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("real");
        std::fs::create_dir(&home).unwrap();
        let alias = temp.path().join("alias");
        std::os::unix::fs::symlink(&home, &alias).unwrap();
        let root = home.canonical_path().unwrap().join("repo");
        let report = serde_json::json!({"configured":true, "server":"reachable", "serverChecked":true, "files":[{"root":root,"path":".env","state":"changed"}]});
        assert_eq!(
            render_report(&report, false, &temp.path().join("elsewhere"), &alias),
            "Server: reachable\nChanged here (run envden push): ~/repo/.env"
        );
    }
}
