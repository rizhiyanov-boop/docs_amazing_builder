declare module 'pako' {
  export interface DeflateOptions {
    level?: number;
    windowBits?: number;
    memLevel?: number;
    strategy?: number;
    dictionary?: string | ArrayBuffer | Uint8Array;
    to?: 'string';
  }

  export function deflate(data: string | ArrayBuffer | Uint8Array, options?: DeflateOptions): Uint8Array;
}
