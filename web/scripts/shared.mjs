import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { keccak256, stringToHex } from 'viem';
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const abiHash = (abi) => keccak256(stringToHex(JSON.stringify(canonical(abi)))).slice(2);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
export async function files(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const e of entries) {
    if (e.isSymbolicLink()) throw new Error(`Symlink is not an export asset: ${e.name}`);
    if (e.isDirectory()) result.push(...(await files(`${dir}/${e.name}`, `${prefix}${e.name}/`)));
    else result.push(`${prefix}${e.name}`);
  }
  return result.sort();
}
