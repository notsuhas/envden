// How a store file appears in a checkout.
export type TPlacementMode = "link" | "copy";

export interface IPlacementAdapter {
  readonly mode: TPlacementMode;
  supported(dir: string): Promise<boolean>;
  place(
    storePath: string,
    checkoutPath: string,
    prepareTemporary?: (path: string) => Promise<void>,
    // the exact text of a user's own link that the user agreed envden may replace
    replacingLink?: string,
  ): Promise<void>;
  remove(storePath: string | undefined, checkoutPath: string): Promise<void>;
  // "linked" means the checkout file is still the placement this adapter made.
  inspect(
    storePath: string,
    checkoutPath: string,
  ): Promise<"linked" | "relinkable" | "detached" | "missing">;
}
