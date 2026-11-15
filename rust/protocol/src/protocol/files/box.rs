use super::file_id;
use crate::protocol::{
    codecs::{IFile, IFileName},
    crypto::{h, kdf, open_box, seal_box},
    encoding::*,
};
use envden_core::errors::Result;

pub struct IFileContext {
    pub vault_id: [u8; 32],
    pub epoch: u32,
    pub file_id: [u8; 32],
    pub version: u64,
}

fn ad(label: &str, c: &IFileContext) -> Vec<u8> {
    [
        ctx(label),
        c.vault_id.to_vec(),
        c.epoch.to_be_bytes().to_vec(),
        c.file_id.to_vec(),
        c.version.to_be_bytes().to_vec(),
    ]
    .concat()
}

fn seal<T: ICodec>(
    v: &T,
    key: &[u8; 32],
    c: &IFileContext,
    label: &str,
    nonce: &[u8; 24],
) -> Result<Vec<u8>> {
    seal_box(
        &kdf(key, &c.vault_id, &format!("{label}-key"), &c.file_id),
        &pad(&encode(v)?),
        &ad(label, c),
        nonce,
    )
}

fn open<T: ICodec>(b: &[u8], key: &[u8; 32], c: &IFileContext, label: &str) -> Result<T> {
    decode_padded(&open_box(
        &kdf(key, &c.vault_id, &format!("{label}-key"), &c.file_id),
        b,
        &ad(label, c),
    )?)
}

pub fn seal_file_name(
    v: &IFileName,
    key: &[u8; 32],
    c: &IFileContext,
    nonce: &[u8; 24],
) -> Result<Vec<u8>> {
    seal(v, key, c, "file-name", nonce)
}

pub fn seal_file(v: &IFile, key: &[u8; 32], c: &IFileContext, nonce: &[u8; 24]) -> Result<Vec<u8>> {
    seal(v, key, c, "file", nonce)
}

pub fn open_file_name(
    b: &[u8],
    key: &[u8; 32],
    id: &[u8; 32],
    c: &IFileContext,
) -> Result<IFileName> {
    let v: IFileName = open(b, key, c, "file-name")?;
    require_value(
        file_id(id, &v.repo_id, &v.path)? == c.file_id,
        "File ID mismatch",
    )?;
    Ok(v)
}

pub fn open_file(
    b: &[u8],
    key: &[u8; 32],
    id: &[u8; 32],
    c: &IFileContext,
    hash: &[u8; 32],
    name: &IFileName,
) -> Result<IFile> {
    require_value(h("blob", b) == *hash, "Blob hash mismatch")?;
    let v: IFile = open(b, key, c, "file")?;
    require_value(
        file_id(id, &v.repo_id, &v.path)? == c.file_id,
        "File ID mismatch",
    )?;
    require_value(
        v.repo_id == name.repo_id && v.path == name.path,
        "File name mismatch",
    )?;
    Ok(v)
}
