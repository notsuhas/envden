use ed25519_dalek::SigningKey;

#[derive(Debug, Clone)]
pub struct IRecoveryKeys {
    pub enc_sk: [u8; 32],
    pub obj_sk: [u8; 32],
    pub enc_pub: [u8; 32],
    pub obj_pub: [u8; 32],
}

#[derive(Debug, Clone)]
pub struct IDeviceKeys {
    pub recovery: IRecoveryKeys,
    pub req_sk: [u8; 32],
    pub req_pub: [u8; 32],
}

pub fn generate_recovery_keys(mut rng: impl FnMut() -> [u8; 32]) -> IRecoveryKeys {
    let enc_sk = rng();
    let obj_sk = rng();
    IRecoveryKeys {
        enc_sk,
        obj_sk,
        enc_pub: x25519_dalek::x25519(enc_sk, x25519_dalek::X25519_BASEPOINT_BYTES),
        obj_pub: SigningKey::from_bytes(&obj_sk).verifying_key().to_bytes(),
    }
}

pub fn generate_device_keys(mut rng: impl FnMut() -> [u8; 32]) -> IDeviceKeys {
    let recovery = generate_recovery_keys(&mut rng);
    let req_sk = rng();
    IDeviceKeys {
        recovery,
        req_sk,
        req_pub: SigningKey::from_bytes(&req_sk).verifying_key().to_bytes(),
    }
}
