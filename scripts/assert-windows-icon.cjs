const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')

const [, , executable, expectedIcon] = process.argv
const pe = readFileSync(executable)
const nt = pe.readUInt32LE(0x3c)
assert.equal(pe.readUInt32LE(nt), 0x4550, 'Expected a Windows PE executable')
const sectionTable = nt + 24 + pe.readUInt16LE(nt + 20)
let resources
for (let i = 0; i < pe.readUInt16LE(nt + 6); i++) {
  const section = sectionTable + i * 40
  if (pe.toString('ascii', section, section + 8).replace(/\0+$/, '') !== '.rsrc') continue
  const offset = pe.readUInt32LE(section + 20)
  resources = pe.subarray(offset, offset + pe.readUInt32LE(section + 16))
  break
}
assert(resources, 'The executable has no Windows resources section')

const ico = readFileSync(expectedIcon)
assert.equal(ico.readUInt16LE(2), 1, 'Expected an ICO file')
const images = ico.readUInt16LE(4)
assert(images > 0, 'The ICO has no images')
for (let i = 0; i < images; i++) {
  const entry = 6 + i * 16
  const offset = ico.readUInt32LE(entry + 12)
  const image = ico.subarray(offset, offset + ico.readUInt32LE(entry + 8))
  assert(image.length && resources.includes(image), `Missing ${ico[entry] || 256}px FlowNote icon from the installed PE resources`)
}
console.log(`Verified all ${images} embedded FlowNote icon sizes`)
