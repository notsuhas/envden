import { EnvdenError } from "../../errors/envden-error.ts";

export const EMPTY = new Uint8Array();

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export function equal(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);

  return diff === 0;
}

export function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = a[i]! - b[i]!;
    if (d) return d;
  }

  return a.length - b.length;
}

export function requireValue(ok: boolean, message = "Invalid protocol data"): asserts ok {
  if (!ok) throw new EnvdenError("INVALID_DATA", message);
}

export interface ICodec<T> {
  read: (r: Reader) => T;
  write: (v: T) => Uint8Array;
}

export class Reader {
  offset = 0;
  readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  take(n: number): Uint8Array {
    requireValue(
      Number.isSafeInteger(n) && n >= 0 && n <= this.data.length - this.offset,
      "Truncated data",
    );

    const value = this.data.slice(this.offset, this.offset + n);
    this.offset += n;

    return value;
  }

  end(): void {
    requireValue(this.offset === this.data.length, "Trailing bytes");
  }
}

export function fixed(length: number): ICodec<Uint8Array> {
  return {
    read: (r) => r.take(length),
    write: (v) => {
      requireValue(v.length === length, "Wrong byte length");

      return v;
    },
  };
}

export const u8: ICodec<number> = {
  read: (r) => r.take(1)[0]!,
  write: (v) => {
    requireValue(Number.isInteger(v) && v >= 0 && v <= 255);

    return Uint8Array.of(v);
  },
};

export const u32: ICodec<number> = {
  read: (r) => {
    const bytes = r.take(4);

    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  },
  write: (v) => {
    requireValue(Number.isInteger(v) && v >= 0 && v <= 0xffffffff);
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v);

    return b;
  },
};

export const u64: ICodec<bigint> = {
  read: (r) => {
    const bytes = r.take(8);

    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0);
  },
  write: (v) => {
    requireValue(v >= 0n && v <= 0xffffffffffffffffn);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, v);

    return b;
  },
};

export const b16 = fixed(16),
  b32 = fixed(32),
  b64 = fixed(64);

export function sized(limit: number): ICodec<Uint8Array> {
  return {
    read: (r) => {
      const n = u32.read(r);
      requireValue(n <= limit, "Length limit");

      return r.take(n);
    },
    write: (v) => {
      requireValue(v.length <= limit, "Length limit");

      return concat(u32.write(v.length), v);
    },
  };
}

export const bytes = sized(65536),
  blob = sized(2 * 1024 * 1024);

export function list<T>(item: ICodec<T>, order?: (a: T, b: T) => number): ICodec<T[]> {
  function check(values: T[]): void {
    requireValue(values.length <= 100000, "List limit");

    if (order)
      for (let i = 1; i < values.length; i++)
        requireValue(order(values[i - 1]!, values[i]!) < 0, "Unsorted or duplicate list");
  }

  return {
    read: (r) => {
      const n = u32.read(r);
      requireValue(n <= 100000, "List limit");
      const values = Array.from({ length: n }, () => item.read(r));
      check(values);

      return values;
    },
    write: (v) => {
      check(v);

      return concat(u32.write(v.length), ...v.map(item.write));
    },
  };
}

export function opt<T>(item: ICodec<T>): ICodec<T | undefined> {
  return {
    read: (r) => {
      const flag = u8.read(r);
      requireValue(flag <= 1, "Invalid option");

      return flag ? item.read(r) : undefined;
    },
    write: (v) => (v === undefined ? u8.write(0) : concat(u8.write(1), item.write(v))),
  };
}

export function codec<T>(
  read: (r: Reader) => T,
  write: (v: T) => Uint8Array,
  validate?: (v: T) => void,
): ICodec<T> {
  return {
    read: (r) => {
      const v = read(r);
      validate?.(v);

      return v;
    },
    write: (v) => {
      validate?.(v);

      return write(v);
    },
  };
}

export function encode<T>(c: ICodec<T>, v: T): Uint8Array {
  return c.write(v);
}

export function decode<T>(c: ICodec<T>, data: Uint8Array): T {
  const r = new Reader(data);
  const v = c.read(r);
  r.end();

  return v;
}

export function tagged(tag: number, r: Reader): void {
  const type = u8.read(r);
  const version = u8.read(r);

  if (type !== tag || version !== 1)
    throw new EnvdenError("UPDATE_REQUIRED", "Unknown object format");
}

export function header(tag: number): Uint8Array {
  return Uint8Array.of(tag, 1);
}
