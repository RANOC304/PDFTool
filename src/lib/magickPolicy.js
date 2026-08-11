export const HIGH_PRECISION_FORMATS = new Set([
  'DPX', 'EXR', 'FITS', 'FTS', 'HDR', 'J2C', 'J2K', 'JP2', 'JPC', 'JXL', 'MIFF',
  'PAM', 'PDF', 'PDFA', 'PFM', 'PNG', 'PNG48', 'PNG64', 'PNM', 'PPM', 'PSB', 'PSD',
  'PTIF', 'TIFF', 'TIFF64',
])

const OPAQUE_FORMATS = new Set([
  'BMP', 'BMP2', 'BMP3', 'JPE', 'JPEG', 'JPG', 'PJPEG', 'PCX', 'PICT', 'PPM', 'TGA',
])

const LOSSY_FORMATS = new Set([
  'AVIF', 'HEIC', 'HEIF', 'JPE', 'JPEG', 'JPG', 'JXL', 'PJPEG', 'WEBP',
])

const MULTI_FRAME_FORMATS = new Set([
  'APNG', 'AVIF', 'GIF', 'GIF87', 'JXL', 'MIFF', 'MNG', 'PDF', 'PDFA', 'PS', 'PS2',
  'PS3', 'PSB', 'PSD', 'PTIF', 'TIFF', 'TIFF64', 'WEBP',
])

export const MAGICK_RESOURCE_LIMITS = {
  inputBytes: 512 * 1024 * 1024,
  framePixels: 64_000_000,
  totalPixels: 256_000_000,
  frames: 1_000,
}

function setArtifacts(image, values) {
  Object.entries(values).forEach(([name, value]) => image.setArtifact(name, value))
}

export function prepareMagickImage(image, format, module) {
  image.autoOrient()
  if (LOSSY_FORMATS.has(format)) image.quality = format === 'AVIF' ? 99 : 100
  if (['JPE', 'JPEG', 'JPG', 'PJPEG'].includes(format)) {
    setArtifacts(image, {
      'jpeg:sampling-factor': '1x1,1x1,1x1',
      'jpeg:optimize-coding': true,
      'jpeg:dct-method': 'float',
    })
  }
  if (format === 'WEBP') {
    setArtifacts(image, {
      'webp:lossless': true,
      'webp:exact': true,
      'webp:method': 6,
      'webp:alpha-quality': 100,
      'webp:auto-filter': true,
    })
  }
  if (format === 'JXL') setArtifacts(image, { 'jxl:distance': 0, 'jxl:effort': 9 })
  if (['AVIF', 'HEIC', 'HEIF'].includes(format)) {
    setArtifacts(image, { 'heic:chroma': '444', 'heic:speed': 0 })
  }
  if (format.startsWith('PNG')) {
    setArtifacts(image, {
      'png:compression-level': 9,
      'png:compression-filter': 5,
      'png:compression-strategy': 1,
    })
  }
  if (OPAQUE_FORMATS.has(format)) {
    image.backgroundColor = module.MagickColors.White
    image.alpha(module.AlphaAction.Remove)
  }
}

export function assertMagickPrecision(images, conversion) {
  const sourceDepth = Math.max(...images.map((image) => image.depth || 8))
  if (sourceDepth <= 8) return
  const targetCanCarryPrecision = HIGH_PRECISION_FORMATS.has(conversion.engineFormat)
  throw new Error(targetCanCarryPrecision
    ? `This ${sourceDepth}-bit source needs a Q16 image engine for an authentic ${conversion.targetLabel} copy. The local Q8 engine stopped instead of silently reducing colour precision.`
    : `${conversion.targetLabel} cannot retain this source's ${sourceDepth}-bit colour precision. The conversion stopped instead of silently reducing it.`)
}

export function assertMagickResourceLimits(images, limits = MAGICK_RESOURCE_LIMITS) {
  if (images.length > limits.frames) {
    throw new Error(`This image contains ${images.length.toLocaleString()} frames, above the safe ${limits.frames.toLocaleString()}-frame browser limit. No frames were omitted.`)
  }
  let totalPixels = 0
  images.forEach((image, index) => {
    const pixels = Number(image.width) * Number(image.height)
    if (!Number.isFinite(pixels) || pixels <= 0) throw new Error(`Frame ${index + 1} has invalid image geometry.`)
    if (pixels > limits.framePixels) {
      throw new Error(`Frame ${index + 1} contains ${(pixels / 1_000_000).toFixed(1)} megapixels, above the safe ${(limits.framePixels / 1_000_000).toFixed(1)}-megapixel limit. It was not resized.`)
    }
    totalPixels += pixels
  })
  if (totalPixels > limits.totalPixels) {
    throw new Error(`This image collection contains ${(totalPixels / 1_000_000).toFixed(1)} megapixels in total, above the safe ${(limits.totalPixels / 1_000_000).toFixed(1)}-megapixel browser limit. No frames were reduced or omitted.`)
  }
}

export function magickFormatSupportsFrames(format) {
  return MULTI_FRAME_FORMATS.has(format)
}
