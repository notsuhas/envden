import { ButtonLink } from "@/components/landing/ui/button-link.tsx";
import { ChannelList } from "@/components/landing/install/channel-list.tsx";
import { CLI_CHANNELS, SERVER_CHANNELS } from "@/components/landing/install/channels.ts";
import { Reveal } from "@/components/landing/ui/reveal.tsx";
import { Section } from "@/components/landing/ui/section.tsx";
import { DOCS_ROUTE } from "@/lib/routes.ts";

export function Install() {
  return (
    <Section
      id="install"
      title="Install"
      lede="Nothing here is published yet. These are the channels v1 will ship through."
    >
      <Reveal className="mt-12">
        <ChannelList label="CLI" channels={CLI_CHANNELS} />
        <ChannelList label="Server" channels={SERVER_CHANNELS} />
        <div className="border-t border-den-line pt-8">
          <p className="max-w-2xl text-den-muted">
            The CLI is a single binary for macOS, Linux and Windows, with no background daemon. The
            server is one Docker container, or the same binary running on one of your devices.
            envden is self-host only and MIT licensed.
          </p>
          <div className="mt-6">
            <ButtonLink href={`${DOCS_ROUTE}/getting-started`} variant="quiet">
              See how setup will work
            </ButtonLink>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
