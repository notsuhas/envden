import { InView } from "@/components/landing/ui/motion/in-view.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

const DEVICES = [
  { name: "laptop", removed: false },
  { name: "desktop", removed: false },
  { name: "old-laptop", removed: true },
];

const GONE_CLASS =
  "transition-opacity delay-500 duration-500 ease-out group-data-[seen=true]:opacity-40";

export function RemovePreview() {
  return (
    <Window title="envden device rm old-laptop">
      <InView className="group font-mono text-[11.5px]">
        <ul>
          {DEVICES.map((device) => (
            <li
              key={device.name}
              className={`flex items-center justify-between border-b border-den-line px-3 py-1.5 ${device.removed ? GONE_CLASS : ""}`}
            >
              <span className="text-den-ink">{device.name}</span>
              <span className={device.removed ? "text-den-alarm" : "text-den-muted"}>
                {device.removed ? "removed" : "member"}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 px-3 py-2 text-den-muted">
          keys
          <span className="text-den-ink">epoch 1</span>
          <span aria-hidden="true">→</span>
          <span className="text-den-lantern opacity-0 transition-opacity delay-[900ms] duration-500 ease-out group-data-[seen=true]:opacity-100">
            epoch 2
          </span>
        </p>
      </InView>
    </Window>
  );
}
