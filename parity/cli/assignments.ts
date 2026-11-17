export interface IBinaries {
  reference: string;
  candidate: string;
  third?: string;
}

export interface IAssignment {
  name: string;
  roles: Record<string, string>;
}

function isServer(role: string): boolean {
  return role === "server" || role.startsWith("server:");
}

function assign(roles: string[], pick: (role: string) => string): Record<string, string> {
  return Object.fromEntries(roles.map((role) => [role, pick(role)]));
}

function mixes(roles: string[], binaries: IBinaries): IAssignment[] {
  const { reference, candidate, third } = binaries;
  const devices = roles.filter((role) => !isServer(role));
  const deviceAt = (role: string) => devices.indexOf(role);

  const servers = (pick: (device: number) => string) => (role: string) =>
    isServer(role) ? pick(-1) : pick(deviceAt(role));

  const result: IAssignment[] = [
    {
      name: "candidate servers",
      roles: assign(
        roles,
        servers((d) => (d < 0 ? candidate : reference)),
      ),
    },
    {
      name: "candidate devices",
      roles: assign(
        roles,
        servers((d) => (d < 0 ? reference : candidate)),
      ),
    },
    ...roles.map((only) => ({
      name: `candidate ${only}`,
      roles: assign(roles, (role) => (role === only ? candidate : reference)),
    })),
  ];

  if (!third) return result;

  const trio = (d: number) => (d < 1 ? reference : d === 1 ? candidate : third);
  const thirdServers = (d: number) => (d < 0 ? third : d === 0 ? reference : candidate);

  if (devices.length >= 3)
    result.push({
      name: "reference, candidate and third devices",
      roles: assign(roles, servers(trio)),
    });

  if (devices.length >= 2)
    result.push({ name: "third servers", roles: assign(roles, servers(thirdServers)) });

  return result;
}

// Mixed runs add per-role substitutions to the plain run, all compared against one reference run.
export function assignments(roles: string[], binaries: IBinaries, mix: boolean): IAssignment[] {
  const everywhere = (binary: string) => JSON.stringify(assign(roles, () => binary));
  const plain = { name: "candidate", roles: assign(roles, () => binaries.candidate) };

  if (!mix) return [plain];

  const seen = new Set([everywhere(binaries.reference), everywhere(binaries.candidate)]);

  const fresh = mixes(roles, binaries).filter((assignment) => {
    const key = JSON.stringify(assignment.roles);
    const unseen = !seen.has(key);

    seen.add(key);

    return unseen;
  });

  return [plain, ...fresh];
}
