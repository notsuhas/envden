use super::super::resume::resume_close;
use super::fixture::fixture;

#[test]
fn empty_saved_repair_close_is_absent_without_network() {
    let (_dir, adapters, server, token) = fixture();
    std::fs::write(adapters.home.join("state/repair-close"), "").unwrap();
    assert!(
        resume_close(&adapters, &token, server.clone())
            .unwrap()
            .is_none()
    );
    assert!(server.requests.borrow().is_empty());
}
