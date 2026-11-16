use std::{fs, path::Path};

// Written by the TypeScript adapter's `bridge.mjs write`; the generator lives outside this repo.
pub fn copy_into(dir: &Path) {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ts-written");

    fs::create_dir_all(dir.join("blobs/01")).unwrap();
    fs::copy(source.join("envden.sqlite"), dir.join("envden.sqlite")).unwrap();
    fs::copy(source.join("blobs/01/05"), dir.join("blobs/01/05")).unwrap();
}
