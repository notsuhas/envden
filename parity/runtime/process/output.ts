export async function output(
  child: Pick<Bun.Subprocess<"ignore", "pipe", "pipe">, "stdout" | "stderr" | "exited">,
) {
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { stdout, stderr, code };
}
