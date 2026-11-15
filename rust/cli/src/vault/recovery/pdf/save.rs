use envden_core::{errors::Result, process::restrict_access};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

pub fn kit_file_name(vault: &str, copy: u64) -> String {
    let prefix: String = vault.chars().take(6).collect();
    let base = format!("envden Recovery Kit {prefix}");
    if copy == 1 {
        format!("{base}.pdf")
    } else {
        format!("{base} ({copy}).pdf")
    }
}

pub fn kit_folder(home: &Path) -> PathBuf {
    let downloads = home.join("Downloads");
    if downloads.is_dir() {
        downloads
    } else {
        home.into()
    }
}

pub fn write_kit_pdf(folder: &Path, vault: &str, bytes: &[u8]) -> Result<PathBuf> {
    for copy in 1.. {
        let path = folder.join(kit_file_name(vault, copy));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = match options.open(&path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(crate::state::files::failure(e)),
        };
        let result = restrict_access(&path, false)
            .and_then(|()| file.write_all(bytes).map_err(crate::state::files::failure));
        drop(file);
        if let Err(error) = result {
            let _ = fs::remove_file(&path);
            return Err(error);
        }
        return Ok(path);
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_unique_pdf_files_and_folder() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(kit_folder(root.path()), root.path());
        fs::create_dir(root.path().join("Downloads")).unwrap();
        assert_eq!(kit_folder(root.path()), root.path().join("Downloads"));
        let first = write_kit_pdf(root.path(), "ABCDEF12", b"one").unwrap();
        let second = write_kit_pdf(root.path(), "ABCDEF12", b"two").unwrap();
        assert_eq!(first.file_name().unwrap(), "envden Recovery Kit ABCDEF.pdf");
        assert_eq!(
            second.file_name().unwrap(),
            "envden Recovery Kit ABCDEF (2).pdf"
        );
        assert_eq!(fs::read(first).unwrap(), b"one");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(second).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
}
