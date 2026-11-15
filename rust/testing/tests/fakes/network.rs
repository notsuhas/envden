use envden_core::adapters::*;
use envden_testing::network;
#[test]
fn network_check_https_certificate_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = network::IFakeNetworkAdapter::default().check_https_certificate();
        })
        .is_err()
    );
}

#[test]
fn network_status_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = network::IFakeNetworkAdapter::default().status();
        })
        .is_err()
    );
}

#[test]
fn network_expose_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = network::IFakeNetworkAdapter::default().expose(0.0);
        })
        .is_err()
    );
}
