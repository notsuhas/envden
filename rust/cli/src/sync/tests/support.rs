use crate::*;
use std::{fs, process::Command};

pub(super) fn opts(a: &adapters::IAdapters) -> sync::remote::context::ISyncOptions {
    sync::remote::context::ISyncOptions {
        unlock: None,
        now: std::rc::Rc::new(a.now),
        cwd: None,
        all: true,
        yes: true,
        interactive: true,
        choose: None,
        confirm: None,
        report: None,
    }
}
pub(super) fn repo(a: &adapters::IAdapters) -> std::path::PathBuf {
    let root = a.user_home.join("repo");
    fs::create_dir_all(&root).unwrap();
    assert!(
        Command::new("git")
            .args(["init", "-q"])
            .arg(&root)
            .status()
            .unwrap()
            .success()
    );
    assert!(
        Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["remote", "add", "origin", "https://github.com/test/review"])
            .status()
            .unwrap()
            .success()
    );
    fs::write(root.join(".gitignore"), ".env\n.env.local\n").unwrap();
    fs::canonicalize(root).unwrap()
}
pub(super) fn entry(
    c: &sync::remote::context::ISyncContext<'_>,
    path: &str,
    version: u64,
    bytes: &[u8],
) -> envden_protocol::protocol::IFileEntry {
    use envden_protocol::protocol as p;
    let repo = "github.com/test/review";
    let id = p::file_id(&c.checkpoint.id_key, repo, path).unwrap();
    let ctx = p::IFileContext {
        vault_id: c.vault_id,
        epoch: 1,
        file_id: id,
        version,
    };
    let key = &c.keys[&1];
    let blob = p::seal_file(
        &p::IFile {
            repo_id: repo.into(),
            path: path.into(),
            content: bytes.into(),
        },
        key,
        &ctx,
        &p::random_bytes::<24>(),
    )
    .unwrap();
    let hash = p::h("blob", &blob);
    state::files::atomic_write(
        &c.adapters
            .home
            .join("state/blobs")
            .join(client::text(&hash)),
        &blob,
        (c.options.now)(),
    )
    .unwrap();
    p::IFileEntry {
        file_id: id,
        version,
        epoch: 1,
        state: 1,
        blob_hash: hash,
        name: p::seal_file_name(
            &p::IFileName {
                repo_id: repo.into(),
                path: path.into(),
            },
            key,
            &ctx,
            &p::random_bytes::<24>(),
        )
        .unwrap(),
    }
}
