use super::identity::IFileIdentity;
use std::{
    fs::{File, OpenOptions},
    io,
    os::windows::{fs::OpenOptionsExt, io::AsRawHandle},
    path::Path,
};
use windows_sys::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, FILE_BASIC_INFO, FILE_FLAG_BACKUP_SEMANTICS,
    FILE_FLAG_OPEN_REPARSE_POINT, FileBasicInfo, GetFileInformationByHandle,
    GetFileInformationByHandleEx,
};

#[allow(unsafe_code)]
pub(super) fn identity(file: &File) -> io::Result<IFileIdentity> {
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    let mut basic = FILE_BASIC_INFO::default();
    // Windows exposes stable file IDs, link counts and change times through handle APIs only.
    unsafe {
        if GetFileInformationByHandle(file.as_raw_handle(), &mut info) == 0
            || GetFileInformationByHandleEx(
                file.as_raw_handle(),
                FileBasicInfo,
                (&mut basic as *mut FILE_BASIC_INFO).cast(),
                std::mem::size_of::<FILE_BASIC_INFO>() as u32,
            ) == 0
        {
            return Err(io::Error::last_os_error());
        }
    }
    let epoch = 116444736000000000i128;
    let unix_ns = |t: i64| (t as i128 - epoch) * 100;
    let birth_ns = unix_ns(basic.CreationTime);
    let birth = birth_ns.div_euclid(1_000_000_000) as f64 * 1000.0
        + birth_ns.rem_euclid(1_000_000_000) as f64 / 1_000_000.0;
    Ok(IFileIdentity {
        device: info.dwVolumeSerialNumber as u64,
        inode: (info.nFileIndexHigh as u64) << 32 | info.nFileIndexLow as u64,
        links: info.nNumberOfLinks as u64,
        size: (info.nFileSizeHigh as u64) << 32 | info.nFileSizeLow as u64,
        modified_ns: unix_ns(basic.LastWriteTime),
        changed_ns: unix_ns(basic.ChangeTime),
        birth_ms: birth.to_string(),
    })
}

pub(super) fn path_identity(path: &Path) -> io::Result<IFileIdentity> {
    let file = OpenOptions::new()
        .access_mode(0)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)?;
    identity(&file)
}
