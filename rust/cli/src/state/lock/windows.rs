use super::owner::TProcess;
use windows_sys::Win32::{
    Foundation::{CloseHandle, ERROR_INVALID_PARAMETER, FILETIME, GetLastError},
    System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
};

#[allow(unsafe_code)]
pub(super) fn process_start(pid: u32) -> TProcess {
    // Windows exposes process creation time only through its unsafe handle API.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return if GetLastError() == ERROR_INVALID_PARAMETER {
                TProcess::Dead
            } else {
                TProcess::Unknown
            };
        }
        let mut creation = FILETIME::default();
        let mut exit = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        let ok = GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user);
        CloseHandle(handle);
        if ok == 0 {
            return TProcess::Unknown;
        }
        TProcess::Live(
            ((u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime))
                .to_string(),
        )
    }
}
