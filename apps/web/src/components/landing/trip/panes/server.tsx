import { ENV_LINES } from "@/components/landing/content/env-lines.ts";
import { CipherRow } from "@/components/landing/trip/panes/cipher-row.tsx";
import { Pane } from "@/components/landing/trip/panes/frame.tsx";

interface IServerPane {
  filled: boolean;
}

const ROWS = ENV_LINES.map((_, row) => row);
const LIGHTS = [0, 400, 900];

export function ServerPane(props: IServerPane) {
  const { filled } = props;

  return (
    <Pane
      area="server"
      title="envden serve"
      status={filled ? "ciphertext" : "empty"}
      tone={filled ? "cold" : "idle"}
    >
      <div
        className="text-den-cipher opacity-0 transition-opacity duration-300 ease-out data-[filled=true]:opacity-100"
        data-filled={filled}
        aria-hidden="true"
      >
        {ROWS.map((row) => (
          <CipherRow key={row} row={row} scramble={filled} />
        ))}
      </div>
      <span className="absolute right-2 bottom-2 flex gap-1 bg-den-ground p-1" aria-hidden="true">
        {LIGHTS.map((delay) => (
          <span
            key={delay}
            className="den-pulse h-1.5 w-1.5 bg-den-lantern"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="sr-only">{filled ? "Encrypted file contents" : "Nothing stored yet"}</span>
    </Pane>
  );
}
