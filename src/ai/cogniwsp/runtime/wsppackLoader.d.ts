export interface WspPackTensorDescriptor {
  name: string;
  dtype: 'f32' | 'i8' | 'float32' | 'int8';
  shape: number[];
  scaleOffset: number;
  scaleLength?: number;
  dataOffset: number;
  byteLength: number;
}

export interface WspPackManifest {
  profile?: string;
  tensors: WspPackTensorDescriptor[];
  [key: string]: unknown;
}

export interface ParsedWspPack {
  version: number;
  manifest: WspPackManifest;
  tensors: Record<string, Float32Array>;
  rawTensors: Record<
    string,
    {
      dtype: string;
      shape: number[];
      data: Float32Array | Int8Array;
      scales: Float32Array | null;
    }
  >;
  byteLength: number;
}

export function dequantizeInt8(
  int8Array: Int8Array | number[],
  scales: number | Float32Array | number[]
): Float32Array;

export function quantizeInt8(
  float32Array: Float32Array,
  rows?: number
): { data: Int8Array; scales: Float32Array };

export function verifyWspPackBudget(
  bytes: number | ArrayBuffer | ArrayBufferView,
  maxBytes?: number
): { ok: boolean; byteLength: number; maxBytes: number; remainingBytes: number };

export function serializeWspPack(
  manifest?: Record<string, unknown>,
  tensors?:
    | Record<
        string,
        | Float32Array
        | Int8Array
        | {
            data: Float32Array | Int8Array | number[];
            dtype?: 'f32' | 'i8' | 'float32' | 'int8';
            shape?: number[];
            scales?: number | Float32Array | number[] | null;
          }
      >
    | Array<{
        name: string;
        data: Float32Array | Int8Array | number[];
        dtype?: 'f32' | 'i8' | 'float32' | 'int8';
        shape?: number[];
        scales?: number | Float32Array | number[] | null;
      }>
): Uint8Array;

export function parseWspPack(arrayBufferOrUint8Array: ArrayBuffer | ArrayBufferView): ParsedWspPack;

declare const wsppackLoader: {
  parseWspPack: typeof parseWspPack;
  serializeWspPack: typeof serializeWspPack;
  dequantizeInt8: typeof dequantizeInt8;
  quantizeInt8: typeof quantizeInt8;
  verifyWspPackBudget: typeof verifyWspPackBudget;
};

export default wsppackLoader;
