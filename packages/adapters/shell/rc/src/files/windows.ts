import { execTrusted } from "@envden/core/process";
import { EnvdenError } from "@envden/core/errors";

export async function verifyWindowsOwner(path: string): Promise<void> {
  const { stdout } = await execTrusted(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; $p=$env:ENVDEN_RC_PATH; $a=[IO.File]::GetAttributes($p); if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }; $acl=if (($a -band [IO.FileAttributes]::Directory) -ne 0) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }; $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent(); ($owner -eq $identity.User.Value) -or ($owner -eq $identity.Owner.Value)",
    ],
    { env: { ENVDEN_RC_PATH: path } },
  );

  if (stdout.trim() !== "True")
    throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration owner");
}
