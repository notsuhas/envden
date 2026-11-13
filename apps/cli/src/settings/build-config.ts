declare const __ENVDEN_TELEMETRY_KEY__: string;

export const TELEMETRY_KEY =
  typeof __ENVDEN_TELEMETRY_KEY__ === "string" ? __ENVDEN_TELEMETRY_KEY__ : "";
