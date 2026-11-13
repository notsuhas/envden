import { cipherLine } from "@/components/landing/content/cipher.ts";
import { ENV_LINES } from "@/components/landing/content/env-lines.ts";
import { Pane } from "@/components/landing/trip/panes/frame.tsx";
import { NumberedLine } from "@/components/landing/trip/panes/numbered-line.tsx";
import { EnvLine } from "@/components/landing/ui/env-line.tsx";

interface IDesktopPane {
  holds: "nothing" | "ciphertext" | "file";
}

const STATUS = {
  nothing: { label: "waiting", tone: "idle" },
  ciphertext: { label: "verifying", tone: "cold" },
  file: { label: "identical", tone: "warm" },
} as const;

const LINE_STAGGER_MS = 70;
const CIPHER_COLUMNS = 28;
const LAYER_CLASS = "transition-opacity duration-300 ease-out";

export function DesktopPane(props: IDesktopPane) {
  const { holds } = props;
  const status = STATUS[holds];

  return (
    <Pane
      area="desktop"
      title="~/work/shop/.env"
      status={status.label}
      tone={status.tone}
      lit={holds === "file"}
    >
      <ol
        aria-hidden={holds !== "file"}
        className={holds === "ciphertext" ? "den-fade-right" : undefined}
      >
        {ENV_LINES.map((line, index) => (
          <NumberedLine key={line || `blank-${index}`} number={index + 1}>
            <span className="relative">
              <span
                className={`${LAYER_CLASS} ${holds === "file" ? "opacity-100" : "opacity-0"}`}
                style={{ transitionDelay: `${index * LINE_STAGGER_MS}ms` }}
              >
                <EnvLine text={line} />
              </span>
              <span
                className={`absolute top-0 left-0 break-all text-den-cipher ${LAYER_CLASS} ${holds === "ciphertext" ? "opacity-100" : "opacity-0"}`}
                style={{ transitionDelay: `${index * LINE_STAGGER_MS}ms` }}
              >
                {cipherLine(CIPHER_COLUMNS, index * 31 + 5)}
              </span>
            </span>
          </NumberedLine>
        ))}
      </ol>
    </Pane>
  );
}
