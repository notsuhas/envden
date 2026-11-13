interface IChannelList {
  label: string;
  channels: string[];
}

export function ChannelList(props: IChannelList) {
  const { label, channels } = props;

  return (
    <div className="grid gap-4 border-t border-den-line py-8 md:grid-cols-[10rem_minmax(0,1fr)]">
      <h3 className="font-display text-xl font-semibold text-den-ink">{label}</h3>
      <ul className="flex flex-wrap gap-2">
        {channels.map((channel) => (
          <li
            key={channel}
            className="rounded-full border border-dashed border-den-line px-4 py-1.5 font-mono text-sm text-den-ink"
          >
            {channel}
          </li>
        ))}
      </ul>
    </div>
  );
}
