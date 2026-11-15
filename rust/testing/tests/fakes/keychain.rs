use envden_core::adapters::*;
use envden_testing::keychain;
#[test]
fn keychain_owner_only_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = keychain::IFakeKeychainAdapter::default().owner_only();
        })
        .is_err()
    );
}

#[test]
fn keychain_get_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = keychain::IFakeKeychainAdapter::default().get("", false);
        })
        .is_err()
    );
}

#[test]
fn keychain_set_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = keychain::IFakeKeychainAdapter::default().set("", &[]);
        })
        .is_err()
    );
}

#[test]
fn keychain_delete_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = keychain::IFakeKeychainAdapter::default().delete("");
        })
        .is_err()
    );
}
