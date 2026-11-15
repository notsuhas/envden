use envden_core::adapters::*;
use envden_testing::keychain;
#[test]
fn keychain_owner_only_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = keychain::IFakeKeychainAdapter::default().owner_only();
        }),
        "keychain.ownerOnly",
    );
}

#[test]
fn keychain_get_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = keychain::IFakeKeychainAdapter::default().get("", false);
        }),
        "keychain.get",
    );
}

#[test]
fn keychain_set_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = keychain::IFakeKeychainAdapter::default().set("", &[]);
        }),
        "keychain.set",
    );
}

#[test]
fn keychain_delete_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = keychain::IFakeKeychainAdapter::default().delete("");
        }),
        "keychain.delete",
    );
}
