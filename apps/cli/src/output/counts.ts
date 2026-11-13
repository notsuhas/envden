import { AsyncLocalStorage } from "node:async_hooks";

export const commandCounts = new AsyncLocalStorage<{ changed?: number; conflicts?: number }>();
