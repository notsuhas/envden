use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    process::{ISpawnOptions, exec_trusted},
};
use std::{collections::BTreeMap, path::Path};

pub(crate) fn verify_owner(path: &Path) -> Result<()> {
    let command = "$ErrorActionPreference='Stop'; $p=$env:ENVDEN_RC_PATH; $a=[IO.File]::GetAttributes($p); if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }; $acl=if (($a -band [IO.FileAttributes]::Directory) -ne 0) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }; $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent(); ($owner -eq $identity.User.Value) -or ($owner -eq $identity.Owner.Value)";
    let output = exec_trusted(
        "powershell.exe",
        &["-NoProfile", "-NonInteractive", "-Command", command].map(str::to_owned),
        &ISpawnOptions {
            env: BTreeMap::from([(
                "ENVDEN_RC_PATH".into(),
                Some(path.to_string_lossy().into_owned()),
            )]),
            ..Default::default()
        },
    )?;
    if String::from_utf8_lossy(&output.stdout).trim() != "True" {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe shell configuration owner",
        ));
    }
    Ok(())
}
