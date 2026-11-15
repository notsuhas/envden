use super::fixture;
use crate::sync::remote::context::{ISyncOptions, sync_context};

#[test]
fn only_interactive_sync_has_an_unlock_callback() {
    let (_dir, adapters, server, _) = fixture::fixture();
    for interactive in [false, true] {
        let options = ISyncOptions {
            now: adapters.now,
            cwd: None,
            all: true,
            yes: true,
            interactive,
            choose: None,
            confirm: None,
            report: None,
        };
        let context = sync_context(&adapters, options, server.clone()).unwrap();
        assert_eq!(context.client.options.unlock.is_some(), interactive);
    }
}
