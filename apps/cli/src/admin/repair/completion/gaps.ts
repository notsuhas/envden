export function deriveGapAction(
  gaps: { missing: unknown[]; lost: unknown[] },
  acceptLost: boolean | undefined,
) {
  if (gaps.missing.length || (gaps.lost.length && !acceptLost)) return { kind: "report" } as const;

  return { kind: "finish" } as const;
}
