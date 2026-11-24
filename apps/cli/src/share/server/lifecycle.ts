export interface IShareState {
  claimed: boolean;
  expiresAt: number;
}

type TClaimAnswer = { kind: "file" } | { kind: "already-opened" } | { kind: "expired" };

// Only a claim uses the link up; viewing the page never does.
export function claimAnswer(state: IShareState, now: number): TClaimAnswer {
  if (state.claimed) return { kind: "already-opened" };

  return now < state.expiresAt ? { kind: "file" } : { kind: "expired" };
}
