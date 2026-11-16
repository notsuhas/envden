import { connect } from "node:net";

interface IExchange {
  port: number;
  request: string;
  // Resolves early once the collected bytes are complete.
  done?: ((bytes: Buffer) => boolean) | undefined;
  timeoutMs: number;
}

export interface IReply {
  bytes: Buffer;
  closed: boolean;
}

export function exchange(options: IExchange): Promise<IReply> {
  return new Promise<IReply>((accept, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(options.port, "127.0.0.1", () => socket.write(options.request));

    const finish = (closed: boolean) => {
      socket.destroy();
      accept({ bytes: Buffer.concat(chunks), closed });
    };

    socket.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
      if (options.done?.(Buffer.concat(chunks))) finish(false);
    });

    socket.on("end", () => finish(true));
    socket.on("error", reject);
    socket.setTimeout(options.timeoutMs, () => finish(false));
  });
}
