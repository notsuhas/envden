use super::*;
use envden_testing::network::IFakeNetworkAdapter;
use serde_json::json;
use std::sync::{Arc, Mutex};

#[test]
fn local_host_and_rehost_use_supplied_capabilities() {
    let dir = tempfile::tempdir().unwrap();
    let mut adapters =
        crate::adapters::create_adapters(Some(dir.path().join("envden")), dir.path().into(), || 1);
    let calls = Arc::new(Mutex::new(Vec::new()));
    let hosted = calls.clone();
    adapters.host_server = Arc::new(move |_, port| {
        hosted.lock().unwrap().push(port);
        Ok(())
    });
    adapters.server_port = Arc::new(|| Ok(54321));
    adapters.local_setup_token = Arc::new(|_| Ok(Some("fake-token".into())));
    adapters.network = Arc::new(IFakeNetworkAdapter {
        check_https_certificate: Some(Box::new(|| Ok(THttpsCheck::Ready))),
        expose: Some(Box::new(|port| {
            assert_eq!(port, 54321.0);
            Ok("https://fake.test".into())
        })),
        ..Default::default()
    });
    assert_eq!(
        host_locally(&adapters, &json!({"hostServer":true})).unwrap(),
        Some(("https://fake.test".into(), Some("fake-token".into())))
    );
    assert_eq!(
        host_locally(
            &adapters,
            &json!({"hostServer":true,"setupToken":"supplied"})
        )
        .unwrap(),
        Some(("https://fake.test".into(), None))
    );
    rehost(&adapters, &mut json!({})).unwrap();
    assert_eq!(*calls.lock().unwrap(), [54321, 54321, 54321]);
    assert!(!adapters.home.join("server").exists());
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(windows) {
        "win32"
    } else {
        "linux"
    };
    let service = crate::agent::service::location::service_file(
        platform,
        &adapters.user_home,
        &adapters.home,
    )
    .unwrap();
    std::fs::create_dir_all(service.parent().unwrap()).unwrap();
    let definition = "envden server --port 54322";
    let bytes = if cfg!(windows) {
        definition
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect()
    } else {
        definition.as_bytes().to_vec()
    };
    std::fs::write(service, bytes).unwrap();
    adapters.server_port = Arc::new(|| panic!("installed service must retain its port"));
    rehost(&adapters, &mut json!({})).unwrap();
    assert_eq!(*calls.lock().unwrap(), [54321, 54321, 54321, 54322]);
}

#[test]
fn unexpected_local_hosting_is_refused_without_service_or_network_effects() {
    let dir = tempfile::tempdir().unwrap();
    let adapters =
        crate::adapters::create_adapters(Some(dir.path().join("envden")), dir.path().into(), || 1);
    assert_eq!(
        host_locally(&adapters, &json!({"hostServer":true}))
            .unwrap_err()
            .message,
        "Unexpected adapter operation: network.checkHttpsCertificate"
    );
    assert_eq!(
        rehost(&adapters, &mut json!({})).unwrap_err().message,
        "Unexpected adapter operation: serverPort"
    );
    assert_eq!(
        (adapters.host_server)(&adapters, 54321)
            .unwrap_err()
            .message,
        "Unexpected adapter operation: hostServer"
    );
    assert_eq!(
        (adapters.local_setup_token)(&adapters).unwrap_err().message,
        "Unexpected adapter operation: localSetupToken"
    );
    assert!(!adapters.home.exists());
}
