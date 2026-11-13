import { CommandBox } from "@/components/landing/install/command-box.tsx";
import { PathCell } from "@/components/landing/install/path-cell.tsx";
import { START_PATHS } from "@/components/landing/install/paths.ts";
import { InstallWindow } from "@/components/landing/install/window.tsx";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { Section } from "@/components/landing/ui/section.tsx";

export function Install() {
  return (
    <Section
      id="install"
      aside={
        <div className="w-full lg:w-80">
          <CommandBox name="install-heading" />
        </div>
      }
      title={
        <>
          Up and running in <Accent>a few minutes</Accent>.
        </>
      }
    >
      <div className="den-dots border-t border-den-line p-3 sm:p-6 lg:p-8">
        <InstallWindow />
      </div>
      <div className="den-cells border-t border-den-line sm:grid-cols-2 xl:grid-cols-4">
        {START_PATHS.map((path) => (
          <PathCell key={path.href} {...path} />
        ))}
      </div>
    </Section>
  );
}
