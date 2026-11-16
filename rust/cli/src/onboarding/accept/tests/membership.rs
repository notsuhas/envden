use super::*;

#[test]
fn latest_membership_rejects_removed_device_and_changed_pin() {
    let dir = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
    let identity = device_identity(&*adapters.keychain, &adapters.home, "test", false, 42).unwrap();
    let material = create_genesis(&identity, [2; 32], 42).unwrap();
    let c::TDeviceListResult::Valid { mut state } =
        c::verify_chain(&[material.genesis, material.epoch]).unwrap()
    else {
        panic!("valid")
    };
    assert!(latest_membership(&state, &identity.record.id, &[2; 32]).is_ok());
    state.server_pin = [3; 32];
    assert!(latest_membership(&state, &identity.record.id, &[2; 32]).is_err());
    state.server_pin = [2; 32];
    state.devices.remove(&identity.record.id);
    assert!(latest_membership(&state, &identity.record.id, &[2; 32]).is_err());
}
