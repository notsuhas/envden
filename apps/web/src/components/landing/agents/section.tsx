import { CADENCE } from "@/components/landing/agents/cadence.ts";
import { AgentsDemo } from "@/components/landing/agents/demo.tsx";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { Section } from "@/components/landing/ui/section.tsx";

export function Agents() {
  return (
    <Section
      id="agents"
      title={
        <>
          Every worktree gets the env. <Accent>You say yes once.</Accent>
        </>
      }
      body="Coding agents open worktrees all day, and each one needs the env. Approved checkouts of a repo share one file, and a worktree of an approved clone gets it on its first sync. Agents can check status and sync when you ask, but only you can approve a checkout or type the master password."
    >
      <AgentsDemo />
      <ul className="den-cells border-t border-den-line sm:grid-cols-3">
        {CADENCE.map((item) => (
          <li key={item.when} className="den-cell min-w-0 px-5 py-5 sm:px-8">
            <p className="font-mono text-sm text-den-lantern">{item.when}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-pretty text-den-muted">
              {item.what}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
