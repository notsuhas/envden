export function* sequences(alphabet: readonly string[], length: number): Generator<string[]> {
  if (!length) {
    yield [];

    return;
  }

  for (const prefix of sequences(alphabet, length - 1))
    for (const token of alphabet) yield [...prefix, token];
}

function randomSource() {
  let seed = 1;

  return (size: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

    return Math.floor((seed / 4294967296) * size);
  };
}

export function randomTraces(count: number) {
  const random = randomSource();
  const pick = <T>(items: readonly T[]) => items[random(items.length)]!;

  const layouts = [
    ["copy"],
    ["link"],
    ["copy", "copy"],
    ["copy", "link"],
    ["link", "copy"],
  ] as const;

  return Array.from({ length: count }, () => {
    const layout = pick(layouts);
    const bOps = secondOperations(layout);

    const aOps = [
      "Ae",
      "Ae",
      "Ar",
      "Al",
      "As",
      "As",
      "Ax",
      "Am",
      "Ak",
      "At",
      "a",
      "a",
      "r",
      "Ae=2",
      "Ar",
    ];

    const tokens: string[] = [];
    const length = 5 + random(4);
    let previous = "";

    for (let step = 0; step < length; step++) {
      const failure = /^B[xf]/.test(previous);

      const token = failure
        ? random(4)
          ? pick(["a", "r", "a", "Ae", "As", "Al", "Ar"])
          : pick(bOps)
        : random(3)
          ? pick(bOps)
          : pick(aOps);

      tokens.push(token);
      previous = token;
    }

    return { layout, tokens };
  });
}

function secondOperations(layout: readonly ("copy" | "link")[]) {
  const operations = [
    "Be",
    "Be",
    "Br",
    "Bl",
    "Bs",
    "Bs",
    "Bx",
    "Bx",
    "Bf",
    "Bf",
    "Bm",
    "Bk",
    "Bt",
    "Bu",
  ];

  if (layout.length > 1) operations.push("Be1", "Br1", "Bf0", "Be1", "Bz1", "By1", "By1");
  if (layout[0] === "link") operations.push("Bd", "Bd=zz");

  return operations;
}
