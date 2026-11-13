import { cipherLine } from "@/components/landing/content/cipher.ts";

interface ICipherRow {
  row: number;
  scramble: boolean;
}

const COLUMNS = 28;
const FRAMES = [0, 1, 2, 3, 4, 5];
const ROW_STAGGER_MS = 70;
const ROW_CLASS = "block h-(--den-row)";

export function CipherRow(props: ICipherRow) {
  const { row, scramble } = props;

  return (
    <span className={`${ROW_CLASS} overflow-hidden`}>
      <span
        className={scramble ? "den-scramble block" : "block"}
        style={{ animationDelay: `${row * ROW_STAGGER_MS}ms` }}
      >
        {FRAMES.map((frame) => (
          <span key={frame} className={`${ROW_CLASS} break-all whitespace-pre-wrap`}>
            {cipherLine(COLUMNS, row * 31 + frame)}
          </span>
        ))}
      </span>
    </span>
  );
}
