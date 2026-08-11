import { zipSync } from 'fflate'

export function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function base64ToBytes(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function packageOriginalFile(filename, value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  return zipSync({ [filename]: bytes }, { level: 0 })
}
