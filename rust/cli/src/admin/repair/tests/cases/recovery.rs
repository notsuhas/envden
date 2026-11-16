use super::*;

#[test]
fn close_from_another_repair_is_discarded_without_network() {
    let (_dir, adapters, server, token) = fixture();
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        "laptop",
        false,
        &adapters.now,
    )
    .unwrap();
    let history = crate::vault::history::IVaultHistory {
        entries: server.entries.clone(),
        headers: server.headers.clone(),
        state: match envden_protocol::chain::verify_chain(&server.entries).unwrap() {
            envden_protocol::chain::TDeviceListResult::Valid { state } => *state,
            _ => panic!("chain"),
        },
        states: Default::default(),
    };
    let swap =
        crate::admin::shared::swap::admin_swap(&history, &identity, 12, (adapters.now)(), vec![])
            .unwrap();
    let path = adapters.home.join("state/repair-close");
    crate::state::files::atomic_write(
        &path,
        text(&p::encode(&swap).unwrap()).as_bytes(),
        (adapters.now)(),
    )
    .unwrap();
    assert!(
        super::super::super::resume::resume_close(&adapters, &token, server.clone())
            .unwrap()
            .is_none()
    );
    assert!(!path.exists());
    assert!(server.requests.borrow().is_empty());
}

#[test]
fn pre_command_remote_refresh_writes_notice_cache() {
    struct NoUpdates;
    impl crate::updates::fetch::IFetcher for NoUpdates {
        fn fetch(
            &self,
            _: &str,
            _: crate::updates::fetch::TRedirect,
            _: std::time::Duration,
        ) -> envden_core::errors::Result<crate::updates::fetch::IResponse> {
            panic!("local update opt-out must not fetch")
        }
    }
    let (_dir, adapters, server, _token) = fixture();
    crate::settings::set_config("update-check", "off", &adapters.home, &adapters.now, false)
        .unwrap();
    let result = crate::notice::command::command_notice_with_transport(
        &adapters,
        (adapters.now)(),
        &NoUpdates,
        false,
        None,
        false,
        server,
    );
    assert_eq!(result["repos"], serde_json::json!([]));
    let remote = crate::notice::remote::read_remote_notice(&adapters.home)
        .unwrap()
        .unwrap();
    assert!(remote.repos.is_empty());
    assert_eq!(remote.checked_at, (adapters.now)() as f64);
}
