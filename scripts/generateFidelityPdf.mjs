import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const document = await PDFDocument.create()
document.setTitle('Massicot fidelity proof')
document.setAuthor('Massicot QA')
document.setSubject('Visual page geometry and metadata preservation')
document.setKeywords(['fidelity', 'layout', 'conversion'])
document.setCreator('Massicot fixture generator')
document.setCreationDate(new Date('2026-01-01T00:00:00.000Z'))
document.setModificationDate(new Date('2026-01-01T00:00:00.000Z'))

const regular = await document.embedFont(StandardFonts.Helvetica)
const bold = await document.embedFont(StandardFonts.HelveticaBold)
const ink = rgb(0.11, 0.09, 0.06)
const cream = rgb(0.96, 0.93, 0.86)
const red = rgb(0.55, 0.18, 0.13)
const gold = rgb(0.82, 0.61, 0.22)

const portrait = document.addPage([595.28, 841.89])
portrait.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: cream })
portrait.drawRectangle({ x: 0, y: 590, width: 595.28, height: 251.89, color: ink })
portrait.drawText('MASSICOT', { x: 54, y: 760, font: bold, size: 16, color: gold })
portrait.drawText('Design should', { x: 54, y: 690, font: bold, size: 42, color: rgb(1, 1, 1) })
portrait.drawText('survive conversion.', { x: 54, y: 642, font: bold, size: 42, color: rgb(1, 1, 1) })
portrait.drawRectangle({ x: 54, y: 415, width: 226, height: 120, color: rgb(1, 1, 1), borderColor: red, borderWidth: 2 })
portrait.drawRectangle({ x: 315, y: 415, width: 226, height: 120, color: rgb(1, 1, 1), borderColor: red, borderWidth: 2 })
portrait.drawText('Page geometry', { x: 72, y: 498, font: bold, size: 19, color: ink })
portrait.drawText('Typography, colour and spacing.', { x: 72, y: 463, font: regular, size: 11, color: ink })
portrait.drawText('Metadata', { x: 333, y: 498, font: bold, size: 19, color: ink })
portrait.drawText('Title, author, subject, keywords.', { x: 333, y: 463, font: regular, size: 11, color: ink })
portrait.drawText('Selectable text remains available in the text index.', { x: 54, y: 330, font: regular, size: 14, color: ink })

const landscape = document.addPage([841.89, 595.28])
landscape.drawRectangle({ x: 0, y: 0, width: 841.89, height: 595.28, color: rgb(1, 1, 1) })
landscape.drawRectangle({ x: 0, y: 0, width: 250, height: 595.28, color: red })
landscape.drawText('LANDSCAPE', { x: 44, y: 520, font: bold, size: 16, color: gold })
landscape.drawText('Every page keeps', { x: 300, y: 458, font: bold, size: 38, color: ink })
landscape.drawText('its own dimensions.', { x: 300, y: 412, font: bold, size: 38, color: ink })
for (let index = 0; index < 4; index++) {
  landscape.drawRectangle({
    x: 300 + index * 118,
    y: 185,
    width: 92,
    height: 140,
    color: index % 2 ? gold : cream,
    borderColor: ink,
    borderWidth: 1,
  })
  landscape.drawText(String(index + 1).padStart(2, '0'), {
    x: 326 + index * 118,
    y: 235,
    font: bold,
    size: 28,
    color: ink,
  })
}

const output = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fidelity.pdf')
await writeFile(output, await document.save())
console.log(output)
