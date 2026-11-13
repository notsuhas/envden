export function telemetryEnabled(
  configured: boolean | undefined,
  _interactive: boolean,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.ENVDEN_TELEMETRY === "0" || env.DO_NOT_TRACK === "1") return false;

  return configured ?? false;
}

export function updateCheckEnabled(configured: boolean, env: NodeJS.ProcessEnv = process.env) {
  return configured && env.ENVDEN_NO_UPDATE_CHECK !== "1";
}
