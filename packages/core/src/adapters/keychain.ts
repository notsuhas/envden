// Where a device keeps its private keys.
export interface IKeychainAdapter {
  readonly id: string;
  available(): Promise<boolean>;
  get(name: string): Promise<Uint8Array | undefined>;
  set(name: string, value: Uint8Array): Promise<void>;
  delete(name: string): Promise<void>;
}
