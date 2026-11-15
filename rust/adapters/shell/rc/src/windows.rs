use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    os::windows::{ffi::OsStrExt, fs::MetadataExt},
    path::Path,
    ptr,
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, LocalFree},
    Security::{
        Authorization::{GetNamedSecurityInfoW, SE_FILE_OBJECT},
        EqualSid, GetTokenInformation, OWNER_SECURITY_INFORMATION, TOKEN_INFORMATION_CLASS,
        TOKEN_OWNER, TOKEN_QUERY, TOKEN_USER, TokenOwner, TokenUser,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

fn failure(error: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::InvalidInput, "Subprocess failed", error)
}

#[allow(unsafe_code)]
fn token_information(token: HANDLE, kind: TOKEN_INFORMATION_CLASS) -> Result<Vec<usize>> {
    let mut length = 0;
    // The token API writes variable-sized, pointer-aligned structures into a caller-owned buffer.
    unsafe {
        GetTokenInformation(token, kind, ptr::null_mut(), 0, &mut length);
        if length == 0 {
            return Err(failure(std::io::Error::last_os_error()));
        }
        let mut buffer = vec![0usize; (length as usize).div_ceil(std::mem::size_of::<usize>())];
        if GetTokenInformation(token, kind, buffer.as_mut_ptr().cast(), length, &mut length) == 0 {
            return Err(failure(std::io::Error::last_os_error()));
        }
        Ok(buffer)
    }
}

#[allow(unsafe_code)]
pub(crate) fn verify_owner(path: &Path) -> Result<()> {
    let metadata = path.symlink_metadata().map_err(failure)?;
    if metadata.file_attributes() & 0x400 != 0 {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Subprocess failed",
        ));
    }
    let path: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
    let mut token = ptr::null_mut();
    // Windows exposes owner SIDs and process-token SIDs through pointer-based APIs; all handles are released here.
    unsafe {
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(failure(std::io::Error::last_os_error()));
        }
        let result = (|| {
            let user = token_information(token, TokenUser)?;
            let identity_owner = token_information(token, TokenOwner)?;
            let mut owner = ptr::null_mut();
            let mut descriptor = ptr::null_mut();
            let error = GetNamedSecurityInfoW(
                path.as_ptr(),
                SE_FILE_OBJECT,
                OWNER_SECURITY_INFORMATION,
                &mut owner,
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                &mut descriptor,
            );
            let result = if error != 0 {
                Err(failure(std::io::Error::from_raw_os_error(error as i32)))
            } else {
                let user = (*(user.as_ptr().cast::<TOKEN_USER>())).User.Sid;
                let identity_owner = (*(identity_owner.as_ptr().cast::<TOKEN_OWNER>())).Owner;
                if EqualSid(owner, user) != 0 || EqualSid(owner, identity_owner) != 0 {
                    Ok(())
                } else {
                    Err(EnvdenError::new(
                        ErrorCode::InvalidInput,
                        "Unsafe shell configuration owner",
                    ))
                }
            };
            if !descriptor.is_null() {
                LocalFree(descriptor);
            }
            result
        })();
        CloseHandle(token);
        result
    }
}
