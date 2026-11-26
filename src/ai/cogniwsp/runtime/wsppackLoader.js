// ============================================================================
// CogniWSP Runtime — Portable .wsppack v1 Binary Loader & Serializer
// Zero-dependency ES Module (Node v22 + Browser compatible).
//
// Binary Layout (Little-Endian):
//   [0..3]   4B  magic ("WSPP")
//   [4..7]   4B  uint32 LE version (= 1)
//   [8..11]  4B  uint32 LE headerLen (byte length of UTF-8 JSON manifest)
//   [12 .. 12+headerLen-1]  UTF-8 JSON manifest:
//     { profile, tensors: [{ name, dtype, shape, scaleOffset, dataOffset, byteLength }] }
//   [align4(12+headerLen) .. EOF]  4-byte aligned tensor payloads & optional f32 scales
// ============================================================================

const WSPP_MAGIC = [0x57, 0x53, 0x50, 0x50]; // "WSPP"
const WSPP_VERSION = 1;
const HEADER_PREFIX_BYTES = 12;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function align4(n) {
  return (n + 3) & ~3;
}

function toUint8View(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('Expected ArrayBuffer or ArrayBufferView (e.g. Uint8Array)');
}

function normalizeDtype(dtype, data) {
  if (dtype === 'f32' || dtype === 'float32') return 'f32';
  if (dtype === 'i8' || dtype === 'int8') return 'i8';
  if (data instanceof Int8Array) return 'i8';
  if (data instanceof Float32Array) return 'f32';
  throw new TypeError(`Unsupported tensor dtype "${dtype}". Expected "f32" or "i8".`);
}

function normalizeTensorEntries(tensors) {
  if (!tensors) return [];
  if (Array.isArray(tensors)) {
    return tensors.map((entry) => {
      if (!entry || typeof entry.name !== 'string') {
        throw new TypeError('Tensor entry must have a string "name"');
      }
      return entry;
    });
  }
  if (typeof tensors === 'object') {
    return Object.entries(tensors).map(([name, val]) => {
      if (val instanceof Float32Array || val instanceof Int8Array) {
        return {
          name,
          data: val,
          dtype: val instanceof Int8Array ? 'i8' : 'f32',
          shape: [val.length],
          scales: null
        };
      }
      return { name, ...val };
    });
  }
  throw new TypeError('tensors must be an array of descriptors or a name-keyed object');
}

/**
 * Dequantize an Int8Array using either a scalar scale or per-row Float32Array scales.
 *
 * @param {Int8Array|number[]} int8Array
 * @param {number|Float32Array|number[]} scales
 * @returns {Float32Array}
 */
export function dequantizeInt8(int8Array, scales) {
  const n = int8Array?.length ?? 0;
  const out = new Float32Array(n);
  if (n === 0) return out;

  if (typeof scales === 'number') {
    const s = Number.isFinite(scales) ? scales : 1.0;
    for (let i = 0; i < n; i++) out[i] = int8Array[i] * s;
    return out;
  }

  const scaleLen = scales?.length ?? 0;
  if (scaleLen === 0) {
    for (let i = 0; i < n; i++) out[i] = int8Array[i];
    return out;
  }

  if (scaleLen === 1) {
    const s = scales[0];
    for (let i = 0; i < n; i++) out[i] = int8Array[i] * s;
    return out;
  }

  if (n % scaleLen !== 0) {
    throw new Error(`Scale length (${scaleLen}) must evenly divide int8Array length (${n})`);
  }

  const cols = n / scaleLen;
  for (let r = 0; r < scaleLen; r++) {
    const s = scales[r];
    const rowOff = r * cols;
    for (let c = 0; c < cols; c++) {
      out[rowOff + c] = int8Array[rowOff + c] * s;
    }
  }
  return out;
}

/**
 * Quantize a Float32Array to Int8Array with per-row symmetric scales.
 *
 * @param {Float32Array} float32Array
 * @param {number} [rows=1]
 * @returns {{ data: Int8Array, scales: Float32Array }}
 */
export function quantizeInt8(float32Array, rows = 1) {
  const n = float32Array.length;
  const rCount = Math.max(1, rows | 0);
  if (n % rCount !== 0) {
    throw new Error(`rows (${rCount}) must evenly divide tensor length (${n})`);
  }
  const cols = n / rCount;
  const data = new Int8Array(n);
  const scales = new Float32Array(rCount);

  for (let r = 0; r < rCount; r++) {
    const off = r * cols;
    let maxAbs = 0;
    for (let c = 0; c < cols; c++) {
      const a = Math.abs(float32Array[off + c]);
      if (a > maxAbs) maxAbs = a;
    }
    const scale = maxAbs > 0 ? maxAbs / 127 : 1.0;
    scales[r] = scale;
    const inv = 1 / scale;
    for (let c = 0; c < cols; c++) {
      const q = Math.round(float32Array[off + c] * inv);
      data[off + c] = q > 127 ? 127 : q < -127 ? -127 : q;
    }
  }
  return { data, scales };
}

/**
 * Verify that a serialized .wsppack payload fits within a byte budget.
 *
 * @param {number|ArrayBuffer|ArrayBufferView} bytes
 * @param {number} [maxBytes=4194304]
 * @returns {{ ok: boolean, byteLength: number, maxBytes: number, remainingBytes: number }}
 */
export function verifyWspPackBudget(bytes, maxBytes = 4 * 1024 * 1024) {
  const byteLength = typeof bytes === 'number' ? bytes : toUint8View(bytes).byteLength;
  return {
    ok: byteLength <= maxBytes,
    byteLength,
    maxBytes,
    remainingBytes: maxBytes - byteLength
  };
}

/**
 * Serialize a manifest and tensor map/list into a portable WSPP v1 binary Uint8Array.
 *
 * @param {object} manifest
 * @param {Record<string, Float32Array|Int8Array|object>|Array<object>} tensors
 * @returns {Uint8Array}
 */
export function serializeWspPack(manifest = {}, tensors = {}) {
  const entries = normalizeTensorEntries(tensors);

  const prepared = entries.map((entry) => {
    const dtype = normalizeDtype(entry.dtype, entry.data);
    const dataView = dtype === 'f32'
      ? (entry.data instanceof Float32Array ? entry.data : Float32Array.from(entry.data))
      : (entry.data instanceof Int8Array ? entry.data : Int8Array.from(entry.data));

    let scalesView = null;
    if (dtype === 'i8' && entry.scales != null) {
      if (typeof entry.scales === 'number') {
        scalesView = Float32Array.of(entry.scales);
      } else {
        scalesView = entry.scales instanceof Float32Array
          ? entry.scales
          : Float32Array.from(entry.scales);
      }
    }

    const shape = Array.isArray(entry.shape) && entry.shape.length > 0
      ? [...entry.shape]
      : [dataView.length];

    return {
      name: entry.name,
      dtype,
      shape,
      dataView,
      scalesView,
      dataBytes: dataView.byteLength,
      scaleBytes: scalesView ? scalesView.byteLength : 0
    };
  });

  // Two-pass fixed-point layout so manifest offsets are exact absolute byte offsets.
  let headerBytes = new Uint8Array(0);
  let totalBytes = 0;
  let tensorMeta = [];

  for (let pass = 0; pass < 3; pass++) {
    let cursor = align4(HEADER_PREFIX_BYTES + headerBytes.byteLength);
    tensorMeta = prepared.map((item) => {
      let scaleOffset = -1;
      if (item.scaleBytes > 0) {
        cursor = align4(cursor);
        scaleOffset = cursor;
        cursor += item.scaleBytes;
      }
      cursor = align4(cursor);
      const dataOffset = cursor;
      cursor += item.dataBytes;

      return {
        name: item.name,
        dtype: item.dtype,
        shape: item.shape,
        scaleOffset,
        scaleLength: item.scalesView ? item.scalesView.length : 0,
        dataOffset,
        byteLength: item.dataBytes
      };
    });

    const fullManifest = {
      ...manifest,
      profile: manifest?.profile || 'wsp-core-v2',
      tensors: tensorMeta
    };
    const nextHeaderBytes = textEncoder.encode(JSON.stringify(fullManifest));
    if (nextHeaderBytes.byteLength === headerBytes.byteLength && pass > 0) {
      headerBytes = nextHeaderBytes;
      totalBytes = cursor;
      break;
    }
    headerBytes = nextHeaderBytes;
    totalBytes = cursor;
  }

  const out = new Uint8Array(totalBytes);
  const dv = new DataView(out.buffer);

  // Magic "WSPP"
  out[0] = WSPP_MAGIC[0];
  out[1] = WSPP_MAGIC[1];
  out[2] = WSPP_MAGIC[2];
  out[3] = WSPP_MAGIC[3];
  dv.setUint32(4, WSPP_VERSION, true);
  dv.setUint32(8, headerBytes.byteLength, true);
  out.set(headerBytes, HEADER_PREFIX_BYTES);

  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    const meta = tensorMeta[i];

    if (item.scalesView && meta.scaleOffset >= 0) {
      const scaleBytesView = new Uint8Array(
        item.scalesView.buffer,
        item.scalesView.byteOffset,
        item.scalesView.byteLength
      );
      out.set(scaleBytesView, meta.scaleOffset);
    }

    const dataBytesView = new Uint8Array(
      item.dataView.buffer,
      item.dataView.byteOffset,
      item.dataView.byteLength
    );
    out.set(dataBytesView, meta.dataOffset);
  }

  return out;
}

/**
 * Parse a portable WSPP v1 binary buffer into `{ version, manifest, tensors, rawTensors }`.
 *
 * @param {ArrayBuffer|ArrayBufferView} arrayBufferOrUint8Array
 * @returns {{
 *   version: number,
 *   manifest: object,
 *   tensors: Record<string, Float32Array>,
 *   rawTensors: Record<string, { dtype: string, shape: number[], data: Float32Array|Int8Array, scales: Float32Array|null }>,
 *   byteLength: number
 * }}
 */
export function parseWspPack(arrayBufferOrUint8Array) {
  const bytes = toUint8View(arrayBufferOrUint8Array);
  if (bytes.byteLength < HEADER_PREFIX_BYTES) {
    throw new Error(`Invalid .wsppack buffer: too short (${bytes.byteLength} bytes)`);
  }

  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== WSPP_MAGIC[i]) {
      throw new Error('Invalid .wsppack magic header (expected "WSPP")');
    }
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getUint32(4, true);
  if (version !== WSPP_VERSION) {
    throw new Error(`Unsupported .wsppack version ${version} (expected ${WSPP_VERSION})`);
  }

  const headerLen = dv.getUint32(8, true);
  const headerEnd = HEADER_PREFIX_BYTES + headerLen;
  if (headerLen === 0 || headerEnd > bytes.byteLength) {
    throw new Error(`Invalid .wsppack header length: ${headerLen}`);
  }

  const manifestJson = textDecoder.decode(bytes.subarray(HEADER_PREFIX_BYTES, headerEnd));
  const manifest = JSON.parse(manifestJson);
  const tensorList = Array.isArray(manifest.tensors) ? manifest.tensors : [];

  const tensors = {};
  const rawTensors = {};

  for (const meta of tensorList) {
    const { name, dtype, shape, scaleOffset, scaleLength, dataOffset, byteLength } = meta;
    if (!name || typeof dataOffset !== 'number' || typeof byteLength !== 'number') {
      throw new Error(`Malformed tensor descriptor in .wsppack manifest: ${JSON.stringify(meta)}`);
    }
    if (dataOffset < headerEnd || dataOffset + byteLength > bytes.byteLength) {
      throw new Error(`Tensor "${name}" out of bounds [${dataOffset}, ${dataOffset + byteLength})`);
    }

    let scales = null;
    if (typeof scaleOffset === 'number' && scaleOffset >= headerEnd) {
      const sLen = Number.isInteger(scaleLength) && scaleLength > 0
        ? scaleLength
        : (Array.isArray(shape) && shape.length > 1 ? shape[0] : 1);
      const sBytes = sLen * 4;
      if (scaleOffset + sBytes > bytes.byteLength) {
        throw new Error(`Tensor "${name}" scales out of bounds`);
      }
      scales = new Float32Array(sLen);
      for (let i = 0; i < sLen; i++) {
        scales[i] = dv.getFloat32(scaleOffset + i * 4, true);
      }
    }

    if (dtype === 'f32' || dtype === 'float32') {
      const count = byteLength / 4;
      const arr = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        arr[i] = dv.getFloat32(dataOffset + i * 4, true);
      }
      tensors[name] = arr;
      rawTensors[name] = { dtype: 'f32', shape: shape || [count], data: arr, scales: null };
    } else if (dtype === 'i8' || dtype === 'int8') {
      const q = new Int8Array(bytes.buffer, bytes.byteOffset + dataOffset, byteLength);
      const qCopy = new Int8Array(q);
      const deq = scales ? dequantizeInt8(qCopy, scales) : dequantizeInt8(qCopy, 1.0);
      tensors[name] = deq;
      rawTensors[name] = { dtype: 'i8', shape: shape || [qCopy.length], data: qCopy, scales };
    } else {
      throw new Error(`Unsupported tensor dtype "${dtype}" for "${name}"`);
    }
  }

  return {
    version,
    manifest,
    tensors,
    rawTensors,
    byteLength: bytes.byteLength
  };
}

export default {
  parseWspPack,
  serializeWspPack,
  dequantizeInt8,
  quantizeInt8,
  verifyWspPackBudget
};
