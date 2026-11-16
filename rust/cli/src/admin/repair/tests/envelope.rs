use super::super::upload::upload_repair;
use super::fixture::fixture;

#[test]
fn unreadable_cached_envelope_stops_before_second_history_read() {
    let (_dir, adapters, server, token) = fixture();
    std::fs::create_dir(adapters.home.join("state/envelope.bin")).unwrap();
    assert!(upload_repair(&adapters, &token, server.clone()).is_err());
    assert_eq!(
        server
            .requests
            .borrow()
            .iter()
            .filter(|path| *path == "/v1/entries")
            .count(),
        2
    );
}
