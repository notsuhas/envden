import { EnvLine } from "@/components/landing/ui/env-line.tsx";

interface IDriftLine {
  line: { same: string; drifted: string };
  synced: boolean;
}

const LAYER_CLASS = "col-start-1 row-start-1 transition-opacity duration-500 ease-out";

export function DriftLine(props: IDriftLine) {
  const { line, synced } = props;
  const changed = line.drifted !== line.same;

  return (
    <li className="grid whitespace-pre">
      <span
        data-synced={synced}
        className={`${LAYER_CLASS} opacity-0 data-[synced=true]:opacity-100`}
        aria-hidden={!synced}
      >
        <EnvLine text={line.same} />
      </span>
      <span
        data-synced={synced}
        data-changed={changed}
        data-empty={!line.drifted}
        className={`${LAYER_CLASS} opacity-100 data-[synced=true]:opacity-0 data-[changed=true]:text-den-alarm data-[empty=true]:shadow-[inset_2px_0_0_var(--den-alarm)]`}
        aria-hidden={synced}
      >
        {!changed || line.drifted.startsWith("#") ? <EnvLine text={line.drifted} /> : line.drifted}
      </span>
    </li>
  );
}
