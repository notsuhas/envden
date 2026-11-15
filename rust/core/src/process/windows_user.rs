use crate::errors::{EnvdenError, ErrorCode, Result};
use windows_sys::Win32::System::WindowsProgramming::GetUserNameW;

#[allow(unsafe_code)]
pub(super) fn username() -> Result<String> {
    let mut buffer = vec![0u16; 32768];
    let mut size = buffer.len() as u32;
    // Windows provides the account name independently of caller-controlled environment variables.
    if unsafe { GetUserNameW(buffer.as_mut_ptr(), &mut size) } == 0 {
        return Err(EnvdenError::with_source(
            ErrorCode::InvalidInput,
            "Cannot read account name",
            std::io::Error::last_os_error(),
        ));
    }
    Ok(String::from_utf16_lossy(
        &buffer[..size.saturating_sub(1) as usize],
    ))
}
