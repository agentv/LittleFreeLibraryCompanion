/**
 * The string a device signs for each request (backend "Every signed request"):
 * METHOD \n path-with-query \n hex SHA-256 of the exact body bytes \n timestamp
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

export function canonicalRequest(method: string, pathWithQuery: string, bodyHash: string, timestamp: string): string {
  return [method.toUpperCase(), pathWithQuery, bodyHash, timestamp].join('\n');
}
