import { conflictRecords, saveConflicts } from "../../conflicts.ts";

export async function blocksFile(
  home: string,
  store: string,
  writable: boolean,
  now: () => number,
) {
  const records = await conflictRecords(home);
  if (!records.some((record) => record.store === store)) return false;
  if (!writable) return true;

  await saveConflicts(
    home,
    records.filter((record) => record.store !== store),
    now,
  );

  return false;
}
