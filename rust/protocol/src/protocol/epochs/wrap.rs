use crate::protocol::{
    codecs::IWrap,
    crypto::mac,
    encoding::{ctx, require_value},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use hpke::{
    Deserializable, Kem, OpModeR, OpModeS, Serializable, aead::ChaCha20Poly1305, kdf::HkdfSha256,
    kem::X25519HkdfSha256,
};

pub fn key_commit(key: &[u8; 32], vault: &[u8; 32], epoch: u32) -> [u8; 32] {
    mac(
        key,
        "epoch-commit",
        &[vault.as_slice(), &epoch.to_be_bytes()].concat(),
    )
}

fn info(vault: &[u8; 32], epoch: u32, recipient: &[u8; 16], public: &[u8; 32]) -> Vec<u8> {
    [
        ctx("wrap").as_slice(),
        vault,
        &epoch.to_be_bytes(),
        recipient,
        public,
    ]
    .concat()
}

pub fn seal_wrap(
    key: &[u8; 32],
    vault: &[u8; 32],
    epoch: u32,
    recipient: &[u8; 16],
    public: &[u8; 32],
    ephemeral: &[u8; 32],
) -> Result<IWrap> {
    let run = || -> std::result::Result<IWrap, hpke::HpkeError> {
        let pk = <X25519HkdfSha256 as Kem>::PublicKey::from_bytes(public)?;
        let sk = <X25519HkdfSha256 as Kem>::PrivateKey::from_bytes(ephemeral)?;
        let (enc, mut sender) = hpke::setup_sender_with_ephemeral::<ChaCha20Poly1305, HkdfSha256>(
            &OpModeS::Base,
            &pk,
            &info(vault, epoch, recipient, public),
            sk,
        )?;
        Ok(IWrap {
            recipient: *recipient,
            enc: enc.to_bytes().as_slice().try_into().expect("fixed length"),
            ct: sender.seal(key, &[])?,
        })
    };
    run().map_err(|e| EnvdenError::with_source(ErrorCode::InvalidData, "Unable to encrypt wrap", e))
}

pub fn open_wrap(
    wrap: &IWrap,
    secret: &[u8; 32],
    public: &[u8; 32],
    vault: &[u8; 32],
    epoch: u32,
    commit: &[u8; 32],
) -> Result<[u8; 32]> {
    let run = || -> std::result::Result<Vec<u8>, hpke::HpkeError> {
        let sk = <X25519HkdfSha256 as Kem>::PrivateKey::from_bytes(secret)?;
        let enc = <X25519HkdfSha256 as Kem>::EncappedKey::from_bytes(&wrap.enc)?;
        let mut receiver = hpke::setup_receiver::<ChaCha20Poly1305, HkdfSha256, X25519HkdfSha256>(
            &OpModeR::Base,
            &sk,
            &enc,
            &info(vault, epoch, &wrap.recipient, public),
        )?;
        receiver.open(&wrap.ct, &[])
    };
    let key = run().map_err(|e| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Unable to decrypt wrap", e)
    })?;
    require_value(key.len() == 32, "Invalid fixed length")?;
    let key = key.try_into().expect("checked length");
    require_value(
        key_commit(&key, vault, epoch) == *commit,
        "Epoch commit mismatch",
    )?;
    Ok(key)
}
