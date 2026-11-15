// How devices reach the server (DESIGN § Adapters).
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

export interface INetworkAdapter {
  readonly id: string;
  checkHttpsCertificate(): Promise<THttpsCheck>;
  status(): Promise<INetworkStatus>;
  // Publishes the local server port to the network and returns the address devices dial.
  expose(port: number): Promise<string>;
}
