import { InView } from "@/components/landing/ui/motion/in-view.tsx";
import { Belt } from "@/components/landing/install/belt/belt.tsx";
import { InstallCell } from "@/components/landing/install/cells/shell.tsx";
import { PairingCell } from "@/components/landing/install/cells/pairing.tsx";
import { CommandBox } from "@/components/landing/install/command-box.tsx";
import { DAILY_SESSION, SETUP_SESSION } from "@/components/landing/install/sessions.ts";
import { TypedSession } from "@/components/landing/ui/typed/session.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";

export function InstallWindow() {
  return (
    <InView>
      <Window title="get-envden" className="den-window-still">
        <div className="den-cells sm:grid-cols-2">
          <InstallCell chip="Install">
            <CommandBox name="install" />
            <p className="text-sm text-den-muted">
              One binary for macOS, Linux and Windows. The server is the same binary, or a Docker
              image.
            </p>
          </InstallCell>
          <InstallCell chip="Setup">
            <TypedSession lines={SETUP_SESSION} className="min-h-[14.5rem]" />
          </InstallCell>
        </div>
        <Belt />
        <div className="den-cells border-t border-den-line sm:grid-cols-2 sm:border-t-0">
          <InstallCell chip="Add a device">
            <PairingCell />
          </InstallCell>
          <InstallCell chip="Day to day">
            <TypedSession lines={DAILY_SESSION} className="min-h-[9rem]" />
          </InstallCell>
        </div>
      </Window>
    </InView>
  );
}
