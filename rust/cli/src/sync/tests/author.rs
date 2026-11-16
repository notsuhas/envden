use super::{
    fixture,
    support::{entry, opts},
};
use crate::sync::{local::conflicts::author::entry_author, remote::context::sync_context};

#[test]
fn author_lookup_propagates_file_list_read_failures() {
    let (_dir, a, server, _) = fixture::fixture();
    let mut context = sync_context(&a, opts(&a), server).unwrap();
    let entry = entry(&context, ".env", 1, b"TOKEN=one\n");
    let mut header = context.checkpoint.header.clone();
    header.body.files_hash = [9; 32];
    std::fs::create_dir_all(
        a.home
            .join("state/file-lists")
            .join(crate::client::text(&header.body.files_hash)),
    )
    .unwrap();
    context.headers = vec![header];
    assert_eq!(
        entry_author(&context, &entry).unwrap_err().code,
        envden_core::errors::ErrorCode::InvalidData
    );
}
