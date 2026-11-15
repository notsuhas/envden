export function kitFileName(vaultId: string, copy: number): string {
  const base = `envden Recovery Kit ${vaultId.slice(0, 6)}`;

  return copy === 1 ? `${base}.pdf` : `${base} (${copy}).pdf`;
}
