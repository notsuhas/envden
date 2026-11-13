export function unexpected(operation: string): (...args: never[]) => never {
  return () => {
    throw new Error(`Unexpected fake operation: ${operation}`);
  };
}
