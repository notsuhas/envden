export interface IStatusState {
  enabled: boolean;
  startedAt: number;
  lastPrune?: { at: number; ok: boolean };
}
