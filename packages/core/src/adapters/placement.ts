// How a store file appears in a checkout.
export type TPlacementMode = "link" | "copy";

export interface IPlacementAdapter {
  readonly mode: TPlacementMode;
  supported(dir: string): Promise<boolean>;
  place(storePath: string, checkoutPath: string): Promise<void>;
  remove(storePath: string | undefined, checkoutPath: string): Promise<void>;
  // "linked" means the checkout file is still the placement this adapter made.
  inspect(
    storePath: string,
    checkoutPath: string,
  ): Promise<"linked" | "relinkable" | "detached" | "missing">;
}
