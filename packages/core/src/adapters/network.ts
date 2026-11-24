// How devices reach the server, and how a share reaches the internet (DESIGN § Adapters).
export interface INetworkProblem {
  kind: "not-installed" | "not-running" | "logged-out" | "https-disabled" | "unreadable";
  // Fixed text naming the next step, in the network's own terms.
  message: string;
}

export type THttpsCheck = { kind: "ready" } | INetworkProblem;

export interface INetworkStatus {
  ready: boolean;
  running: boolean;
  loggedIn: boolean;
  httpsEnabled: boolean;
  hostname?: string | undefined;
  problem?: INetworkProblem;
}

// A temporary public address for one path of a local listener (DESIGN § Shares).
export interface IPublicShare {
  url: string;
  // "unchecked": public DNS couldn't be asked, so the link may take minutes to work.
  ready: Promise<"public" | "unchecked">;
  // Settles if the address closes before close() is called.
  ended: Promise<void>;
  close(): Promise<void>;
}

export interface INetworkAdapter {
  readonly id: string;
  checkHttpsCertificate(): Promise<THttpsCheck>;
  status(): Promise<INetworkStatus>;
  // Publishes the local server on the same port number of its own, so it never takes another app's address.
  expose(port: number): Promise<string>;
  // Publishes http://127.0.0.1:<port><path> on the internet until close(); never replaces another service.
  openPublicShare(port: number, path: string): Promise<IPublicShare>;
}
