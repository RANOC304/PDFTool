function positive(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be a positive number.`)
  return number
}

export function planPdfRasterPage({
  width,
  height,
  scale = 2,
  dpi = null,
  maxPixels = 32_000_000,
  maxTotalPixels = Number.POSITIVE_INFINITY,
  renderedPixels = 0,
  pageNumber = 1,
}) {
  const baseWidth = positive(width, 'PDF page width')
  const baseHeight = positive(height, 'PDF page height')
  const requestedScale = dpi === null ? positive(scale, 'PDF render scale') : positive(dpi, 'PDF render DPI') / 72
  const pixelWidth = Math.ceil(baseWidth * requestedScale)
  const pixelHeight = Math.ceil(baseHeight * requestedScale)
  const pagePixels = pixelWidth * pixelHeight
  const requestedDpi = Math.round(requestedScale * 72)

  if (pagePixels > maxPixels) {
    throw new Error(
      `PDF page ${pageNumber} needs ${(pagePixels / 1_000_000).toFixed(1)} megapixels at ${requestedDpi} DPI, above the safe ${(maxPixels / 1_000_000).toFixed(1)}-megapixel page limit. Split or crop the PDF first; the page was not rendered at a lower resolution.`,
    )
  }
  if (renderedPixels + pagePixels > maxTotalPixels) {
    throw new Error(
      `This PDF is too large to render every page at ${requestedDpi} DPI within the safe browser memory limit. Split it into smaller parts first; no page was reduced or omitted.`,
    )
  }
  return { scale: requestedScale, width: pixelWidth, height: pixelHeight, pixels: pagePixels, dpi: requestedDpi }
}
