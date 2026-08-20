import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AlignmentType,
  BorderStyle,
  Bookmark,
  ColumnBreak,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Math,
  MathFraction,
  MathRun,
  PageNumber,
  Packer,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, 'fixtures')
const output = join(fixtures, 'office-fidelity.docx')
const image = await readFile(join(fixtures, 'native-vector-render.png'))

const palette = {
  ink: '1C1710',
  red: '8B2F22',
  gold: 'D19C38',
  cream: 'F4EEE2',
  sand: 'E7DDC9',
  white: 'FFFFFF',
  gray: '6D665C',
}

const border = (color = palette.sand, size = 6) => ({ style: BorderStyle.SINGLE, color, size })
const cell = (children, options = {}) => new TableCell({
  children: Array.isArray(children) ? children : [new Paragraph(String(children))],
  verticalAlign: VerticalAlign.CENTER,
  margins: { top: 120, right: 140, bottom: 120, left: 140 },
  borders: {
    top: border(), right: border(), bottom: border(), left: border(),
  },
  ...options,
})

function textParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { before: 0, after: 140, line: 276, lineRule: LineRuleType.AT_LEAST },
    ...options,
    children: options.children || [new TextRun({ text, color: palette.ink, size: 22, font: 'Aptos' })],
  })
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    keepNext: true,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 260 : 180, after: 120 },
    children: [new TextRun({
      text,
      font: 'Aptos Display',
      color: level === HeadingLevel.HEADING_1 ? palette.red : palette.ink,
      size: level === HeadingLevel.HEADING_1 ? 30 : 25,
      bold: true,
    })],
  })
}

function header(label) {
  return new Header({
    children: [new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [7200, 2160],
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        bottom: border(palette.gold, 10), left: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
      },
      rows: [new TableRow({ children: [
        cell([new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'MASSICOT  /  FIDELITY LAB', color: palette.red, bold: true, size: 18, font: 'Aptos' })],
        })], { width: { size: 7200, type: WidthType.DXA }, borders: {} }),
        cell([new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: label, color: palette.gray, size: 16, font: 'Aptos' })],
        })], { width: { size: 2160, type: WidthType.DXA }, borders: {} }),
      ] })],
    })],
  })
}

function footer() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 80, after: 0 },
      children: [
        new TextRun({ text: 'CONFIDENTIAL  ·  ', color: palette.gray, size: 16, font: 'Aptos' }),
        new TextRun({ children: [PageNumber.CURRENT], color: palette.red, bold: true, size: 16, font: 'Aptos' }),
      ],
    })],
  })
}

const featureTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [2520, 2700, 1980, 2160],
  layout: TableLayoutType.FIXED,
  margins: { top: 100, right: 120, bottom: 100, left: 120 },
  rows: [
    new TableRow({
      tableHeader: true,
      children: ['Component', 'Source design', 'Expected PDF', 'Expected DOCX'].map((value, index) => cell([
        new Paragraph({
          alignment: index > 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: value, bold: true, color: palette.white, size: 18, font: 'Aptos' })],
        }),
      ], { shading: { type: ShadingType.CLEAR, fill: palette.red, color: 'auto' } })),
    }),
    ...[
      ['Paragraphs', 'Styles + mixed runs', 'Exact appearance', 'Native flowing text'],
      ['Tables', 'Merged + wrapped cells', 'Borders and fills', 'Editable cells'],
      ['Artwork', 'Floating image + wrap', 'Original placement', 'Retained media'],
      ['Navigation', 'Links + bookmark', 'Live links', 'Editable links'],
    ].map((row, rowIndex) => new TableRow({
      children: row.map((value, columnIndex) => cell([
        new Paragraph({
          alignment: columnIndex > 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({
            text: value,
            size: 18,
            font: 'Aptos',
            bold: columnIndex === 0,
            color: palette.ink,
          })],
        }),
      ], {
        shading: rowIndex % 2 ? { type: ShadingType.CLEAR, fill: palette.cream, color: 'auto' } : undefined,
      })),
    })),
  ],
})

const summaryBox = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [480, 8880],
  layout: TableLayoutType.FIXED,
  borders: {
    top: border(palette.gold, 8), right: border(palette.gold, 8),
    bottom: border(palette.gold, 8), left: border(palette.gold, 8),
    insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
  },
  rows: [new TableRow({ children: [
    cell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '!', bold: true, color: palette.white, size: 26 })] })], {
      shading: { type: ShadingType.CLEAR, fill: palette.gold, color: 'auto' }, borders: {},
    }),
    cell([new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: 'Acceptance rule. ', bold: true, color: palette.ink, size: 20, font: 'Aptos' }),
        new TextRun({ text: 'A conversion passes only when page rendering and destination structure both pass.', color: palette.ink, size: 20, font: 'Aptos' }),
      ],
    })], { shading: { type: ShadingType.CLEAR, fill: palette.cream, color: 'auto' }, borders: {} }),
  ] })],
})

const pageOne = [
  new Paragraph({
    spacing: { before: 500, after: 80 },
    children: [new TextRun({ text: 'OFFICE CONVERSION', color: palette.gold, bold: true, size: 20, characterSpacing: 70, font: 'Aptos' })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 160, line: 700, lineRule: LineRuleType.EXACT },
    children: [new TextRun({ text: 'Fidelity stress test', color: palette.ink, bold: true, size: 52, font: 'Aptos Display' })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 320 },
    children: [
      new TextRun({ text: 'Tables, paragraphs, links, footnotes, columns, floating media, mixed sections, and Unicode: ', color: palette.gray, size: 23, font: 'Aptos' }),
      new TextRun({ text: 'café · naïve · Ω · Привет', color: palette.red, italics: true, size: 23, font: 'Aptos' }),
    ],
  }),
  summaryBox,
  heading('Preservation matrix'),
  featureTable,
  new Paragraph({
    spacing: { before: 220, after: 100 },
    children: [new Bookmark({
      id: 'details',
      children: [new TextRun({ text: 'Continue to the detailed test scenarios', bold: true, color: palette.red, underline: { color: palette.red }, size: 20 })],
    })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new ExternalHyperlink({
      link: 'https://example.com/fidelity',
      children: [new TextRun({ text: 'External verification link', color: '0563C1', underline: {}, size: 19 })],
    })],
  }),
  new Paragraph({
    spacing: { before: 160, after: 0 },
    children: [
      new TextRun({ text: 'Native equation:  ', color: palette.gray, size: 19, font: 'Aptos' }),
      new Math({ children: [
        new MathFraction({ numerator: [new MathRun('a + b')], denominator: [new MathRun('c')] }),
        new MathRun(' = 1'),
      ] }),
    ],
  }),
]

const columnParagraphs = [
  heading('Two-column reading flow'),
  textParagraph('', { children: [
    new TextRun({ text: 'This page exercises ', size: 22, font: 'Aptos' }),
    new TextRun({ text: 'bold emphasis', bold: true, size: 22, font: 'Aptos' }),
    new TextRun({ text: ', ', size: 22, font: 'Aptos' }),
    new TextRun({ text: 'italics', italics: true, size: 22, font: 'Aptos' }),
    new TextRun({ text: ', underlining, superscripts', underline: {}, size: 22, font: 'Aptos' }),
    new TextRun({ text: '2', superScript: true, size: 16, font: 'Aptos' }),
    new TextRun({ text: ', and exact paragraph rhythm across columns.', size: 22, font: 'Aptos' }),
  ] }),
  heading('Real list numbering', HeadingLevel.HEADING_2),
  ...['Preserve the logical sequence.', 'Keep wrapped lines aligned under the item text.', 'Carry the list into a searchable PDF layer.'].map((text) => new Paragraph({
    numbering: { reference: 'numbered-test', level: 0 },
    spacing: { before: 0, after: 100, line: 260, lineRule: LineRuleType.AT_LEAST },
    children: [new TextRun({ text, size: 21, font: 'Aptos', color: palette.ink })],
  })),
  new Paragraph({ children: [new ColumnBreak()] }),
  heading('Footnote and nested table', HeadingLevel.HEADING_2),
  new Paragraph({
    spacing: { before: 0, after: 160, line: 270, lineRule: LineRuleType.AT_LEAST },
    children: [
      new TextRun({ text: 'The note marker is a real Word footnote', size: 21, font: 'Aptos' }),
      new FootnoteReferenceRun(1),
      new TextRun({ text: ', not text faked in the footer.', size: 21, font: 'Aptos' }),
    ],
  }),
  new Table({
    width: { size: 4320, type: WidthType.DXA },
    columnWidths: [1440, 2880],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [
        cell('Key', { shading: { type: ShadingType.CLEAR, fill: palette.red, color: 'auto' } }),
        cell([new Paragraph({ children: [new TextRun({ text: 'Nested editable content', color: palette.white, bold: true, size: 18 })] })], { shading: { type: ShadingType.CLEAR, fill: palette.red, color: 'auto' } }),
      ] }),
      new TableRow({ children: [
        cell('A-17'),
        cell([new Paragraph({ children: [new TextRun({ text: 'Wrapped cell with a nested 2 × 1 table below.', size: 18 })] }), new Table({
          width: { size: 2400, type: WidthType.DXA },
          columnWidths: [1200, 1200],
          layout: TableLayoutType.FIXED,
          rows: [new TableRow({ children: [cell('Left'), cell('Right')] })],
        })]),
      ] }),
    ],
  }),
  heading('Keep-with-next behavior', HeadingLevel.HEADING_2),
  textParagraph('This heading and paragraph should remain together even when the preceding content grows. The page must not show clipping, overlap, or a stranded heading.'),
]

const landscapeWidths = [1440, 3360, 2160, 2160, 3840]
const landscapeTable = new Table({
  width: { size: 12960, type: WidthType.DXA },
  columnWidths: landscapeWidths,
  layout: TableLayoutType.FIXED,
  rows: [
    new TableRow({ tableHeader: true, children: ['ID', 'Scenario', 'Owner', 'Status', 'Evidence'].map((value, column) => cell([
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, bold: true, color: palette.white, size: 18 })] }),
    ], { width: { size: landscapeWidths[column], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: palette.red, color: 'auto' } })) }),
    ...Array.from({ length: 5 }, (_, index) => {
      const values = [
        `T-${String(index + 1).padStart(2, '0')}`,
        index % 2 ? 'Mixed orientation and page geometry' : 'Floating media with text wrapping',
        index % 3 ? 'Conversion QA' : 'Layout QA',
        index % 2 ? 'Verified' : 'Review',
        'Rendered-page comparison plus native package inspection.',
      ]
      return new TableRow({ children: values.map((value, column) => cell(value, {
        width: { size: landscapeWidths[column], type: WidthType.DXA },
        shading: column === 3 ? { type: ShadingType.CLEAR, fill: index % 2 ? 'E2F0D9' : 'FFF2CC', color: 'auto' } : undefined,
      })) })
    }),
  ],
})

const pageThree = [
  heading('Landscape page with floating artwork'),
  new Paragraph({
    spacing: { before: 0, after: 180 },
    children: [new ImageRun({
      data: image,
      type: 'png',
      transformation: { width: 170, height: 95, rotation: -2 },
      altText: { title: 'Vector fidelity artwork', description: 'A rasterized reference image with alt text.', name: 'Fidelity artwork' },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.RIGHT },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 1_050_000 },
        wrap: { type: TextWrappingType.SQUARE, margins: { top: 80_000, right: 80_000, bottom: 80_000, left: 80_000 } },
      },
    })],
  }),
  textParagraph('The image is anchored to the page and wrapped by this paragraph. Its placement, rotation, crop, and alternate text are part of the fixture. The table below is deliberately wide and uses a repeated header row.'),
  new Paragraph({
    spacing: { before: 0, after: 0, line: 900, lineRule: LineRuleType.EXACT },
    children: [new TextRun({ text: '', size: 2 })],
  }),
  landscapeTable,
]

const document = new Document({
  title: 'Massicot Office fidelity stress test',
  subject: 'DOCX to PDF and PDF to DOCX conversion verification',
  creator: 'Massicot QA',
  keywords: 'docx, pdf, fidelity, tables, footnotes, sections',
  description: 'Deterministic complex Word fixture for conversion regression testing.',
  lastModifiedBy: 'Massicot QA',
  revision: 1,
  compatabilityModeVersion: 15,
  features: { updateFields: true },
  numbering: {
    config: [{
      reference: 'numbered-test',
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 240 } } },
      }],
    }],
  },
  footnotes: {
    1: { children: [new Paragraph({ children: [new TextRun({ text: 'This is editable note content stored in word/footnotes.xml.', size: 18, font: 'Aptos' })] })] },
  },
  styles: {
    default: {
      document: { run: { font: 'Aptos', size: 22, color: palette.ink }, paragraph: { spacing: { after: 120 } } },
      heading1: { run: { font: 'Aptos Display', size: 30, bold: true, color: palette.red }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } },
      heading2: { run: { font: 'Aptos Display', size: 25, bold: true, color: palette.ink }, paragraph: { spacing: { before: 180, after: 100 }, keepNext: true } },
    },
  },
  sections: [
    {
      headers: { default: header('PORTRAIT / 01') },
      footers: { default: footer() },
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1440, bottom: 1080, left: 1440, header: 480, footer: 480, gutter: 0 } },
      },
      children: pageOne,
    },
    {
      headers: { default: header('COLUMNS / 02') },
      footers: { default: footer() },
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080, header: 480, footer: 480, gutter: 0 } },
        column: { count: 2, space: 480, separate: true, equalWidth: true },
      },
      children: columnParagraphs,
    },
    {
      headers: { default: header('LANDSCAPE / 03') },
      footers: { default: footer() },
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: { width: 12240, height: 15840, orientation: 'landscape' }, margin: { top: 900, right: 1080, bottom: 900, left: 1080, header: 420, footer: 420, gutter: 0 } },
      },
      children: pageThree,
    },
  ],
})

await writeFile(output, await Packer.toBuffer(document))
console.log(output)
