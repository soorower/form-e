import type { SheetText, WorkbookPicture } from '#/lib/questionnaire/pictures'

/**
 * Finds the pictures in an Excel workbook (.xlsx) and the cell each one sits
 * in, together with the text of those sheets, so they can be matched to the
 * levels of a choice experiment (`matchWorkbookPictures`).
 *
 * Two kinds of picture are read:
 * - **Pictures in a cell** (Excel's "Place in Cell", or what `IMAGE()` and a
 *   lookup of such a cell return). The cell holds `#VALUE!` for older readers
 *   and a rich value that names the picture; the pavement workbook's `EngBng`
 *   sheet keeps its road photos this way.
 * - **Floating pictures**, placed over the sheet, by the cell their top-left
 *   corner is anchored to.
 *
 * An .xlsx file is a zip of XML parts; this reads just the parts it needs,
 * with the browser's own `DecompressionStream`, so no zip library is loaded.
 */

export interface FoundPicture extends WorkbookPicture {
  /** The picture file inside the workbook, e.g. "xl/media/image3.jpeg". */
  path: string
}

export interface WorkbookPictures {
  pictures: FoundPicture[]
  /** Cell text of every sheet that holds a picture, by sheet name. */
  sheets: Map<string, SheetText>
  /** The picture file as a Blob with its image type. */
  file: (path: string) => Promise<Blob>
}

export async function readWorkbookPictures(data: ArrayBuffer): Promise<WorkbookPictures> {
  const zip = openZip(new Uint8Array(data))
  if (!zip.has('xl/workbook.xml')) {
    throw new Error('This is not an Excel workbook (.xlsx). Save it from Excel as .xlsx and try again.')
  }
  const xml = async (path: string) => (zip.has(path) ? parseXml(await zip.text(path)) : null)

  const sharedStrings = readSharedStrings(await xml('xl/sharedStrings.xml'))
  const richPictures = await readRichValuePictures(xml)

  const workbook = await xml('xl/workbook.xml')
  const workbookRels = await readRels(xml, 'xl/workbook.xml')
  const pictures: FoundPicture[] = []
  const sheets = new Map<string, SheetText>()

  for (const sheet of elements(workbook, 'sheet')) {
    const name = sheet.getAttribute('name') ?? ''
    const path = workbookRels.get(attribute(sheet, 'id') ?? '')
    if (!path || !zip.has(path)) continue
    const sheetXml = await zip.text(path)
    const found: FoundPicture[] = []

    // Cheap test before parsing: most sheets hold neither kind of picture.
    const hasCellPictures = richPictures.length > 0 && / vm="\d+"/.test(sheetXml)
    const hasDrawing = /<(\w+:)?drawing\b/.test(sheetXml)
    if (!hasCellPictures && !hasDrawing) continue
    const document = parseXml(sheetXml)

    if (hasCellPictures) {
      for (const cell of elements(document, 'c')) {
        const vm = Number(cell.getAttribute('vm'))
        const picturePath = vm > 0 ? richPictures[vm - 1] : undefined
        const at = cellPosition(cell.getAttribute('r'))
        if (picturePath && at) found.push({ sheet: name, ...at, path: picturePath, name: baseName(picturePath) })
      }
    }

    if (hasDrawing) {
      const sheetRels = await readRels(xml, path)
      for (const drawing of elements(document, 'drawing')) {
        const drawingPath = sheetRels.get(attribute(drawing, 'id') ?? '')
        if (!drawingPath) continue
        const drawingXml = await xml(drawingPath)
        const drawingRels = await readRels(xml, drawingPath)
        for (const anchor of [
          ...elements(drawingXml, 'twoCellAnchor'),
          ...elements(drawingXml, 'oneCellAnchor'),
        ]) {
          const from = elements(anchor, 'from')[0]
          const blip = elements(anchor, 'blip')[0]
          const picturePath = blip ? drawingRels.get(attribute(blip, 'embed') ?? '') : undefined
          if (!from || !picturePath) continue
          const row = Number(elements(from, 'row')[0]?.textContent) + 1
          const col = Number(elements(from, 'col')[0]?.textContent) + 1
          if (row > 0 && col > 0) found.push({ sheet: name, row, col, path: picturePath, name: baseName(picturePath) })
        }
      }
    }

    if (found.length === 0) continue
    pictures.push(...found)
    sheets.set(name, readSheetText(document, sharedStrings))
  }

  return {
    pictures,
    sheets,
    file: async (path) => new Blob([await zip.bytes(path)], { type: imageType(path) }),
  }
}

/* ------------------------------------------------------------------------ */
/* Workbook parts                                                            */
/* ------------------------------------------------------------------------ */

type ReadXml = (path: string) => Promise<Document | null>

/**
 * The picture behind each cell value-metadata index (`vm="1"` → entry 0).
 * The chain is cell `vm` → valueMetadata block → futureMetadata rich-value
 * index → rich value → its `_rvRel:LocalImageIdentifier` → richValueRel entry
 * → the picture file.
 */
async function readRichValuePictures(xml: ReadXml): Promise<(string | undefined)[]> {
  const metadata = await xml('xl/metadata.xml')
  const values = await xml('xl/richData/rdrichvalue.xml')
  if (!metadata || !values) return []
  const structures = await xml('xl/richData/rdrichvaluestructure.xml')
  const relList = await xml('xl/richData/richValueRel.xml')
  const rels = await readRels(xml, 'xl/richData/richValueRel.xml')

  const relPaths = elements(relList, 'rel').map((rel) => rels.get(attribute(rel, 'id') ?? ''))
  // Which position in each structure holds the picture's rel index.
  const imageKey = elements(structures, 's').map((structure) =>
    elements(structure, 'k').findIndex((key) => key.getAttribute('n') === '_rvRel:LocalImageIdentifier'),
  )
  const valuePictures = elements(values, 'rv').map((value) => {
    const position = imageKey[Number(value.getAttribute('s') ?? 0)] ?? -1
    if (position < 0) return undefined
    const index = Number(elements(value, 'v')[position]?.textContent)
    return Number.isInteger(index) ? relPaths[index] : undefined
  })

  const future = elements(metadata, 'futureMetadata').find(
    (block) => block.getAttribute('name') === 'XLRICHVALUE',
  )
  const futureValues = elements(future ?? null, 'bk').map((block) => {
    const rvb = elements(block, 'rvb')[0]
    return rvb ? Number(rvb.getAttribute('i')) : -1
  })
  const valueMetadata = elements(metadata, 'valueMetadata')[0]
  return elements(valueMetadata ?? null, 'bk').map((block) => {
    const rc = elements(block, 'rc')[0]
    const futureIndex = rc ? futureValues[Number(rc.getAttribute('v'))] : undefined
    return futureIndex !== undefined && futureIndex >= 0 ? valuePictures[futureIndex] : undefined
  })
}

/** A part's relationships (`rId3` → resolved part path), from its `_rels` file. */
async function readRels(xml: ReadXml, partPath: string): Promise<Map<string, string>> {
  const directory = partPath.slice(0, partPath.lastIndexOf('/') + 1)
  const rels = await xml(`${directory}_rels/${baseName(partPath)}.rels`)
  const map = new Map<string, string>()
  for (const rel of elements(rels, 'Relationship')) {
    if (rel.getAttribute('TargetMode') === 'External') continue
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target')
    if (id && target) map.set(id, resolvePath(directory, target))
  }
  return map
}

function readSharedStrings(document: Document | null): string[] {
  // A string may be split into formatted runs; phonetic hints (rPh) are not text.
  return elements(document, 'si').map((item) =>
    elements(item, 't')
      .filter((t) => t.parentElement?.localName !== 'rPh')
      .map((t) => t.textContent ?? '')
      .join(''),
  )
}

function readSheetText(document: Document, sharedStrings: string[]): SheetText {
  const grid: SheetText = new Map()
  for (const cell of elements(document, 'c')) {
    const at = cellPosition(cell.getAttribute('r'))
    if (!at) continue
    const type = cell.getAttribute('t')
    if (type === 'e') continue
    const raw =
      type === 'inlineStr'
        ? elements(cell, 't').map((t) => t.textContent ?? '').join('')
        : (elements(cell, 'v')[0]?.textContent ?? '')
    const value = (type === 's' ? (sharedStrings[Number(raw)] ?? '') : raw).trim()
    if (!value) continue
    const row = grid.get(at.row) ?? new Map<number, string>()
    row.set(at.col, value)
    grid.set(at.row, row)
  }
  return grid
}

/* ------------------------------------------------------------------------ */
/* Small helpers                                                             */
/* ------------------------------------------------------------------------ */

function parseXml(source: string): Document {
  return new DOMParser().parseFromString(source, 'application/xml')
}

/** Descendants by local name, whatever namespace prefix the writer used. */
function elements(root: Document | Element | null, localName: string): Element[] {
  return root ? Array.from(root.getElementsByTagNameNS('*', localName)) : []
}

/** An attribute by local name (`r:id`, `r:embed`), whatever its prefix. */
function attribute(element: Element, localName: string): string | null {
  for (const attr of Array.from(element.attributes)) {
    if (attr.localName === localName && attr.name.includes(':')) return attr.value
  }
  return element.getAttribute(localName)
}

/** "C9" → row 9, column 3. */
function cellPosition(ref: string | null): { row: number; col: number } | null {
  const match = ref ? /^([A-Z]+)(\d+)$/.exec(ref) : null
  if (!match) return null
  let col = 0
  for (const letter of match[1]) col = col * 26 + (letter.charCodeAt(0) - 64)
  return { row: Number(match[2]), col }
}

function resolvePath(directory: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = directory.split('/').filter(Boolean)
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.' && part !== '') parts.push(part)
  }
  return parts.join('/')
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

function imageType(path: string): string {
  return IMAGE_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream'
}

/* ------------------------------------------------------------------------ */
/* Zip                                                                       */
/* ------------------------------------------------------------------------ */

interface ZipEntry {
  method: number
  compressedSize: number
  localOffset: number
}

/** Reads a zip's central directory; entries are inflated only when asked for. */
function openZip(bytes: Uint8Array<ArrayBuffer>) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('This file is not an Excel workbook (.xlsx) or it is damaged.')

  const entries = new Map<string, ZipEntry>()
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  for (let i = 0; i < count && view.getUint32(offset, true) === 0x02014b50; i++) {
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    })
    offset += 46 + nameLength + extraLength + commentLength
  }

  async function read(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const entry = entries.get(path)
    if (!entry) throw new Error(`The workbook has no ${path}.`)
    const local = entry.localOffset
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + entry.compressedSize)
    if (entry.method === 0) return data
    if (entry.method !== 8) throw new Error(`The workbook uses a compression this cannot read (${path}).`)
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  return {
    has: (path: string) => entries.has(path),
    bytes: read,
    text: async (path: string) => decoder.decode(await read(path)),
  }
}
