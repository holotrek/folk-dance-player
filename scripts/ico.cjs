// Packs PNG images into one Windows .ico file (the Vista+ form, in which each image is a PNG).
// Used by make-icon.cjs, which runs inside Electron and so can't load a .mts file.
// `images` are { size, png } with size in pixels (at most 256) and png the encoded PNG.
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const entries = Buffer.alloc(16 * images.length)
  let offset = header.length + entries.length
  images.forEach(({ size, png }, i) => {
    const at = 16 * i
    entries[at] = size >= 256 ? 0 : size // width; 0 means 256
    entries[at + 1] = size >= 256 ? 0 : size // height
    entries.writeUInt16LE(1, at + 4) // colour planes
    entries.writeUInt16LE(32, at + 6) // bits per pixel
    entries.writeUInt32LE(png.length, at + 8)
    entries.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([header, entries, ...images.map((image) => image.png)])
}

module.exports = { buildIco }
