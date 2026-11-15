use super::*;
use envden_protocol::protocol as p;
use std::{cell::RefCell, rc::Rc};

#[test]
fn repairs_report_lost_and_restored_paths() {
    let (_dir, adapters, server, _) = fixture::fixture();
    let reports = Rc::new(RefCell::new(Vec::new()));
    let recorded = reports.clone();
    let options = ISyncOptions {
        now: adapters.now,
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: Some(Rc::new(move |m| recorded.borrow_mut().push(m.to_owned()))),
    };
    let context = super::super::remote::context::sync_context(&adapters, options, server).unwrap();
    let id = p::file_id(&context.checkpoint.id_key, "host/repo", ".env").unwrap();
    let file = p::IFileContext {
        vault_id: context.vault_id,
        epoch: 1,
        file_id: id,
        version: 1,
    };
    let name = p::seal_file_name(
        &p::IFileName {
            repo_id: "host/repo".into(),
            path: ".env".into(),
        },
        &context.keys[&1],
        &file,
        &[0; 24],
    )
    .unwrap();
    let mut entry = p::IFileEntry {
        file_id: id,
        version: 1,
        epoch: 1,
        state: 4,
        blob_hash: [0; 32],
        name,
    };
    super::super::repairs::report_repairs(&context, &[entry.clone()]).unwrap();
    entry.state = 1;
    super::super::repairs::report_repairs(&context, &[entry]).unwrap();
    assert_eq!(
        *reports.borrow(),
        [
            "Repair changed file .env: lost",
            "Repair changed file .env: restored"
        ]
    );
}
