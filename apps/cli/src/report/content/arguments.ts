const SECRET_FLAGS = new Set(["--setup-token", "--repair-token", "--recovery-kit"]);

const PASSWORD_FLAG = /^--?[\w-]*pass/i;

const MASK = "[redacted]";

export function maskArguments(args: readonly string[]): string[] {
  const masked: string[] = [];

  for (const [index, arg] of args.entries()) {
    const [flag, value] = arg.split(/=(.*)/s);

    if (PASSWORD_FLAG.test(flag!))
      return [
        ...masked,
        value === undefined ? arg : `${flag}=${MASK}`,
        ...args.slice(index + 1).map(() => MASK),
      ];

    if (SECRET_FLAGS.has(flag!) && value !== undefined) masked.push(`${flag}=${MASK}`);
    else if (SECRET_FLAGS.has(args[index - 1] ?? "")) masked.push(MASK);
    else masked.push(arg);
  }

  return masked;
}
