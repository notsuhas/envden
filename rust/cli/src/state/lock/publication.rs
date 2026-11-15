use super::owner::IOwner;
use crate::state::files::failure;
use envden_core::errors::Result;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

pub(super) fn publish_owner(path: &Path, owner: &IOwner) -> Result<()> {
    let temporary = path.join(format!(".{}.tmp", owner.token));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options.open(&temporary).map_err(failure)?;
        file.write_all(&serde_json::to_vec(owner).expect("owner serialization"))
            .map_err(failure)?;
        file.sync_all().map_err(failure)?;
        drop(file);
        fs::hard_link(&temporary, path.join("owner.json")).map_err(failure)
    })();
    let _ = fs::remove_file(temporary);
    result
}

pub(super) fn same_directory(before: &fs::Metadata, after: &fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        before.ino() == after.ino() && before.dev() == after.dev()
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        before.volume_serial_number() == after.volume_serial_number()
            && before.file_index() == after.file_index()
    }
}
