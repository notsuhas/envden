import { isDeepStrictEqual } from "node:util";
import type { ICase } from "./cases.ts";
import type { IComparable } from "./wire.ts";

export interface IObservation {
  responses: IComparable[];
  closed?: boolean;
}

function headers(response: IComparable, length?: string): string[] {
  return response.headers
    .map((line) => {
      const colon = line.indexOf(":");
      const name = line.slice(0, colon).toLowerCase();
      const value = line.slice(colon + 1).trim();

      return `${name}:${name === "content-length" && length !== undefined ? length : value}`;
    })
    .sort();
}

function lengths(response: IComparable): string[] {
  return headers(response)
    .filter((h) => h.startsWith("content-length:"))
    .map((h) => h.slice(15));
}

export function semanticObservation(
  item: ICase,
  observed: IObservation,
  getLengths: ReadonlyMap<number, number> = new Map(),
): IObservation {
  return {
    ...observed,
    responses: observed.responses.map((response, index) => {
      const values = lengths(response);
      const head = item.methods[index] === "HEAD";

      const allowedHead = head && isHeadLength(values, getLengths.get(index));
      const malformed = Boolean(item.empty400) && emptyFraming(response, values);

      const normalized = headers(response, allowedHead ? "<HEAD>" : undefined);

      return {
        ...response,
        headers: malformed
          ? normalized.filter((h) => !h.startsWith("content-length:"))
          : normalized,
      };
    }),
  };
}

function isHeadLength(values: string[], getLength?: number): boolean {
  return values.length === 1 && (values[0] === "0" || values[0] === String(getLength));
}

function emptyFraming(response: IComparable, values: string[]): boolean {
  if (response.status !== "HTTP/1.1 400 Bad Request" || response.body !== "") return false;

  return values.length === 0 || (values.length === 1 && values[0] === "0");
}

export function observationsEqual(
  item: ICase,
  observed: [IObservation, IObservation],
  raw: boolean,
  lengths: Map<number, number>[],
): boolean {
  if (!raw && !observed.every((value, side) => validObservation(item, value, lengths[side])))
    return false;

  const pair = raw
    ? observed
    : observed.map((value, side) => semanticObservation(item, value, lengths[side]));

  return isDeepStrictEqual(pair[0], pair[1]);
}

function validObservation(
  item: ICase,
  observed: IObservation,
  getLengths?: Map<number, number>,
): boolean {
  if (observed.responses.length !== item.methods.length) return false;
  if (item.empty400 && observed.closed !== true) return false;

  return observed.responses.every((response, index) => {
    if (item.methods[index] === "HEAD")
      return response.body === "" && isHeadLength(lengths(response), getLengths?.get(index));

    if (item.empty400) return emptyFraming(response, lengths(response));

    return true;
  });
}
