// How devices reach the server (DESIGN § Adapters).
export interface INetworkStatus {
  ready: boolean;
  running: boolean;
  loggedIn: boolean;
  httpsEnabled: boolean;
  hostname?: string | undefined;
  problem?: string;
}

export interface INetworkAdapter {
  readonly id: string;
  status(): Promise<INetworkStatus>;
  // Publishes the local server port to the network and returns the address devices dial.
  expose(port: number): Promise<string>;
}
