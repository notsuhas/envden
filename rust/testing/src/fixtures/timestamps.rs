use std::{
    fs::{FileTimes, OpenOptions},
    io,
    path::Path,
    time::SystemTime,
};

pub fn set_modified(path: &Path, modified: SystemTime) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Windows directory timestamps need FILE_WRITE_ATTRIBUTES and backup semantics.
        options.access_mode(0x100).custom_flags(0x02000000);
    }
    options
        .open(path)?
        .set_times(FileTimes::new().set_modified(modified))
}
