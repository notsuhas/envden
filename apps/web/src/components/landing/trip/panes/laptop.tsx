import { ENV_LINES } from "@/components/landing/content/env-lines.ts";
import { Pane } from "@/components/landing/trip/panes/frame.tsx";
import { NumberedLine } from "@/components/landing/trip/panes/numbered-line.tsx";
import { EnvLine } from "@/components/landing/ui/env-line.tsx";

interface ILaptopPane {
  sealing: boolean;
  lit: boolean;
}

export function LaptopPane(props: ILaptopPane) {
  const { sealing, lit } = props;

  return (
    <Pane
      area="laptop"
      title="~/code/shop/.env"
      status={sealing ? "encrypting" : "readable"}
      tone={sealing ? "cold" : "warm"}
      lit={lit}
    >
      <ol>
        {ENV_LINES.map((line, index) => (
          <NumberedLine key={line || `blank-${index}`} number={index + 1}>
            <EnvLine text={line} />
          </NumberedLine>
        ))}
      </ol>
      <span className="den-sweep" data-sweep={sealing} aria-hidden="true" />
    </Pane>
  );
}
