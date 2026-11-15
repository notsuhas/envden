export async function launchHarness(command: string[]): Promise<void> {
  // The agent owns the terminal now, so Ctrl-C is its to handle.
  const ignore = () => {};
  process.on("SIGINT", ignore);

  try {
    // oxlint-disable-next-line envden/trusted-process -- The user picked their own coding agent, so it runs from their PATH with their environment.
    await Bun.spawn(command, {
      stdio: ["inherit", "inherit", "inherit"],
      env: process.env,
      cwd: process.cwd(),
    }).exited;
  } finally {
    process.off("SIGINT", ignore);
  }
}
