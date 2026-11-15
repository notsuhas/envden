use crate::protocol::{
    codecs::{IPairApprover, IPairJoiner},
    crypto::{open_box, seal_box},
    encoding::*,
};
use envden_core::errors::Result;

fn seal<T: ICodec>(v: &T, key: &[u8; 32], nonce: &[u8; 24]) -> Result<Vec<u8>> {
    let b = seal_box(key, &encode(v)?, &[], nonce)?;
    require_value(b.len() <= 4096, "Pair message limit")?;
    Ok(b)
}

fn open<T: ICodec>(b: &[u8], key: &[u8; 32]) -> Result<T> {
    require_value(b.len() <= 4096, "Pair message limit")?;
    decode(&open_box(key, b, &[])?)
}

pub fn seal_pair_joiner(v: &IPairJoiner, key: &[u8; 32], nonce: &[u8; 24]) -> Result<Vec<u8>> {
    seal(v, key, nonce)
}

pub fn open_pair_joiner(b: &[u8], key: &[u8; 32]) -> Result<IPairJoiner> {
    open(b, key)
}

pub fn seal_pair_approver(v: &IPairApprover, key: &[u8; 32], nonce: &[u8; 24]) -> Result<Vec<u8>> {
    seal(v, key, nonce)
}

pub fn open_pair_approver(b: &[u8], key: &[u8; 32]) -> Result<IPairApprover> {
    open(b, key)
}
