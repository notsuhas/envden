import { afterAll, expect, test } from "bun:test";
import { run } from "./exploration/run.ts";
import { shutdown } from "./exploration/fixtures/world.ts";

afterAll(shutdown);

const cases: [readonly ("copy" | "link")[], string][] = [
  [["link"], "Bs Bf Be As a Bx Al Br"],
  [["link"], "Be Bl Br a Bs"],
  [["copy", "link"], "Am Be a Bm Bz1 Be1 At"],
  [["copy", "copy"], "Bz1 As Ak Br1 Be Br Be1 Bx"],
  [["copy", "copy"], "Bt Bs Bu Br1 By1 a Ae=2 Bz1"],
  [["copy", "copy"], "Be1 Ae Bs Be1 Bz1 Br1"],
  [["copy", "copy"], "Ae=2 Am r Ae Ar Be1 Bs"],
  [["copy", "link"], "Bt Ak By1 Bz1 Ae Bm Be"],
  [["link", "copy"], "Bl Bz1 Bs Am Be1 r"],
  [["link", "copy"], "Bk Bd=zz Bz1 Bx Be1 Ae"],
  [["copy", "copy"], "a Be1 Ak Bz1 r"],
  [["link", "copy"], "Am Ae Bk r Be1 Bz1 Bm Bf0"],
  [["link"], "Be Am Be Bs Ar"],
  [["copy", "copy"], "Bs Be1 Bl At Ae Ar Bx Bs"],
  [["link", "copy"], "Bd Am Bk Bd Bu As As Br"],
  [["copy", "copy"], "r Ae Bz1 Bz1 Ae Bs Be1"],
  [["link"], "Am Bs Ax Bd Bx"],
  [["link"], "Bd Be Am Bk Am Br"],
  [["link", "copy"], "Be1 a Ax Bs Bz1"],
  [["copy"], "Ae Bt Bt Bm Br a"],
  [["link"], "Bd As Al Bk a At"],
  [["copy", "copy"], "Ae=2 Bm Ar Be Bu Bx a"],
  [["link", "copy"], "Bl Bz1 Bf Bd Ar Bf0 Be"],
  [["link", "copy"], "Bd=zz Bz1 Ar Al Bf0 a Be"],
  [["link", "copy"], "Bz1 At Bk Ae Be1 Bf Br As"],
  [["link", "copy"], "As Bd=zz Bd Bf0 a Bs Bd"],
  [["copy", "copy"], "Bf0 a Bs Bx a Bz1"],
  [["copy", "copy"], "Bz1 Bl Be Bf0 Be Ak As Ar"],
  [["copy", "copy"], "Bz1 Br Bl Ae Be1"],
  [["link"], "Ae Bk Bs Bu Be Bx Br"],
  [["copy", "copy"], "Bf As Bf Ae Bz1"],
  [["link", "copy"], "Br Ae Ae Be Br"],
  [["copy", "link"], "Bx a Ar r Be Am Br Ak"],
  [["copy", "copy"], "Al r Bf0 r a Bf a Bz1"],
  [["link"], "Be Bs Be Bm Am r a"],
  [["link", "copy"], "Ar Bx r Be Bz1 At Bf Bs"],
  [["link"], "Bf Ae Am Ae Bd"],
  [["copy"], "Bm Bs Am Bl Ar Bm"],
  [["link", "copy"], "Be Bf Ae Br As"],
  [["link", "copy"], "r Bt Ae Be1 r Ae=2 Bk Br1"],
  [["copy", "copy"], "Be As Ae Bz1 r Bu Bf0"],
  [["link", "copy"], "Bf Ar Bz1 Bm Bx"],
  [["copy", "copy"], "Bf0 Ar Bz1 r Am Bx"],
  [["link"], "Bd=zz Bd Al Bk Bf a"],
  [["copy", "copy"], "At Bz1 Bf0 a Ae=2 Bz1"],
  [["copy"], "a Ae Bm Ae Bm Br Br"],
  [["copy"], "Bt Be At Br r Ae Al Bf"],
  [["copy", "link"], "Al Bu Be At Bz1 Bf As"],
  [["link", "copy"], "Be1 Bm By1 Be Ar Bz1 Ax"],
  [["link", "copy"], "Be1 Bm Bz1 Bd Bd=zz"],
  [["copy", "copy"], "Al Be Bz1 Bk Bl"],
  [["link"], "Br Bd Am a Bs Bx"],
  [["link", "copy"], "Bs As Bd=zz Bm Be At Bz1 At"],
  [["link", "copy"], "Br Bs Be1 Be Bf Br Bx Al"],
  [["link", "copy"], "Ae=2 Bd a Bs Bf Al"],
];

for (const [layout, sequence] of cases)
  test(`discovered ${layout.join("+")} ${sequence}`, async () => {
    const result = await run(layout, sequence.split(" "));

    expect({
      violations: result.violations,
      notes: result.notes,
      trace: result.violations.length ? result.trace : [],
    }).toEqual({ violations: [], notes: [], trace: [] });
  });
