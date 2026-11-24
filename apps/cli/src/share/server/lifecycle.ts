export interface IShareState {
  claimed: boolean;
  expiresAt: number;
}

type TShareAnswer =
  | { kind: "page" }
  | { kind: "file" }
  | { kind: "already-opened" }
  | { kind: "expired" };

// Viewing never burns the link: chat previews and scanners fetch pages but don't press Open.
export function shareAnswer(
  action: "view" | "claim",
  state: IShareState,
  now: number,
): TShareAnswer {
  if (action === "view") return { kind: "page" };

  if (state.claimed) return { kind: "already-opened" };

  return now < state.expiresAt ? { kind: "file" } : { kind: "expired" };
}
