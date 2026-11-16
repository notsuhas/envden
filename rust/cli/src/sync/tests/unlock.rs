use super::fixture;
use crate::sync::remote::context::{ISyncOptions, sync_context};

#[test]
fn only_interactive_contexts_install_the_supplied_unlock_callback() {
    let (_dir, adapters, server, _) = fixture::fixture();
    for interactive in [false, true] {
        let calls = std::rc::Rc::new(std::cell::Cell::new(0usize));
        let recorded = calls.clone();
        let options = ISyncOptions {
            unlock: Some(std::rc::Rc::new(move |client, vault| {
                assert!(client.options.unlock.is_none());
                assert!(client.options.vault_id == *vault);
                recorded.set(recorded.get() + 1);
                Ok(())
            })),
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
        if let Some(unlock) = &context.client.options.unlock {
            unlock().unwrap();
        }
        assert_eq!(calls.get(), usize::from(interactive));
    }
}

#[test]
fn interactive_context_does_not_invent_an_unlock_callback() {
    let (_dir, adapters, server, _) = fixture::fixture();
    let options = ISyncOptions {
        unlock: None,
        now: adapters.now,
        cwd: None,
        all: true,
        yes: true,
        interactive: true,
        choose: None,
        confirm: None,
        report: None,
    };
    let context = sync_context(&adapters, options, server).unwrap();
    assert!(context.client.options.unlock.is_none());
}

#[test]
fn sync_client_uses_the_supplied_clock() {
    let (_dir, adapters, server, _) = fixture::fixture();
    let options = ISyncOptions {
        unlock: None,
        now: || 123,
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    let context = sync_context(&adapters, options, server).unwrap();
    assert_eq!((context.client.options.now)(), 123);
}
