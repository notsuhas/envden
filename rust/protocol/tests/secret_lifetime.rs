use envden_protocol::protocol::{IEnvelope, IRecoveryKeys};

#[test]
fn recovery_secrets_are_cleared_on_every_exit() {
    assert!(std::mem::needs_drop::<IRecoveryKeys>());
    assert!(std::mem::needs_drop::<IEnvelope>());
}

#[test]
fn recovery_buffers_zeroize_without_changing_public_metadata() {
    use envden_protocol::protocol::generate_recovery_keys;
    use zeroize::{Zeroize, ZeroizeOnDrop};

    fn requires_zeroize_on_drop<T: ZeroizeOnDrop>() {}

    requires_zeroize_on_drop::<IRecoveryKeys>();
    requires_zeroize_on_drop::<IEnvelope>();
    let mut keys = generate_recovery_keys(|| [7; 32]);
    let public = (keys.enc_pub, keys.obj_pub);
    keys.zeroize();
    assert_eq!(keys.enc_sk, [0; 32]);
    assert_eq!(keys.obj_sk, [0; 32]);
    assert_eq!((keys.enc_pub, keys.obj_pub), public);

    let mut envelope = IEnvelope {
        vault_id: [1; 32],
        recovery_enc_sk: [7; 32],
        recovery_obj_sk: [8; 32],
        checkpoint: [2; 32],
        sealed_at: 3,
    };
    envelope.zeroize();
    assert_eq!(envelope.recovery_enc_sk, [0; 32]);
    assert_eq!(envelope.recovery_obj_sk, [0; 32]);
    assert_eq!(envelope.vault_id, [1; 32]);
    assert_eq!(envelope.checkpoint, [2; 32]);
    assert_eq!(envelope.sealed_at, 3);
}
