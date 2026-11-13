import { dlopen } from "bun:ffi";

const { symbols } = dlopen("C:\\Windows\\System32\\kernel32.dll", {
  OpenProcess: { args: ["u32", "i32", "u32"], returns: "u64" },
  GetProcessTimes: { args: ["u64", "buffer", "buffer", "buffer", "buffer"], returns: "i32" },
  GetLastError: { args: [], returns: "u32" },
  CloseHandle: { args: ["u64"], returns: "i32" },
});

export function windowsStart(pid: number) {
  const handle = symbols.OpenProcess(0x1000, 0, pid);

  if (handle === 0n)
    return { kind: symbols.GetLastError() === 87 ? ("dead" as const) : ("unknown" as const) };

  try {
    const creation = new BigUint64Array(1);
    const exit = new BigUint64Array(1);
    const kernel = new BigUint64Array(1);
    const user = new BigUint64Array(1);

    if (!symbols.GetProcessTimes(handle, creation, exit, kernel, user))
      return { kind: "unknown" as const };

    return { kind: "live" as const, startedAt: creation[0]!.toString() };
  } finally {
    symbols.CloseHandle(handle);
  }
}
