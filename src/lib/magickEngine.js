import magickWasmUrl from '@imagemagick/magick-wasm/magick.wasm?url'
import { strToU8, zipSync } from 'fflate'
import {
  assertMagickPrecision,
  assertMagickResourceLimits,
  MAGICK_RESOURCE_LIMITS,
  magickFormatSupportsFrames,
  prepareMagickImage,
} from './magickPolicy.js'

let modulePromise

async function getImageMagick() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const module = await import('@imagemagick/magick-wasm')
      const response = await fetch(magickWasmUrl)
      if (!response.ok) throw new Error('The local ImageMagick engine could not be loaded.')
      await module.initializeImageMagick(new Uint8Array(await response.arrayBuffer()))
      return module
    })().catch((error) => {
      modulePromise = null
      throw error
    })
  }
  return modulePromise
}

function convertedFilename(name, extension) {
  const stem = name.replace(/\.[^.]+$/, '')
  return `${stem} (converted).${extension}`
}

export async function convertWithImageMagick(file, conversion) {
  if (file.size > MAGICK_RESOURCE_LIMITS.inputBytes) {
    throw new Error(`This image is larger than the safe ${Math.round(MAGICK_RESOURCE_LIMITS.inputBytes / 1024 / 1024)} MB browser input limit. It was not decoded or changed.`)
  }
  const module = await getImageMagick()
  const input = new Uint8Array(await file.arrayBuffer())
  const output = await module.ImageMagick.readCollection(
    input,
    conversion.engineSource,
    (images) => {
      if (!images.length) throw new Error('ImageMagick did not find a readable image in this file.')

      assertMagickResourceLimits(images)
      assertMagickPrecision(images, conversion)

      if (images.length > 1 && !magickFormatSupportsFrames(conversion.engineFormat)) {
        const timing = images.map((image, index) => ({
          frame: index + 1,
          delay: image.animationDelay,
          ticksPerSecond: image.animationTicksPerSecond,
          iterations: image.animationIterations,
        }))
        images.coalesce()
        const frameEntries = {}
        images.forEach((image, index) => {
          prepareMagickImage(image, conversion.engineFormat, module)
          const frameNumber = String(index + 1).padStart(String(images.length).length, '0')
          frameEntries[`frame-${frameNumber}.${conversion.targetExtension}`] = image.write(
            conversion.engineFormat,
            (data) => new Uint8Array(data),
          )
        })
        frameEntries['animation-timing.json'] = strToU8(JSON.stringify({
          source: file.name,
          frames: timing,
          note: 'The requested format cannot store animation. Every coalesced visual frame is included.',
        }, null, 2))
        return { kind: 'frames', bytes: zipSync(frameEntries, { level: 6 }) }
      }

      images.forEach((image) => prepareMagickImage(image, conversion.engineFormat, module))
      return {
        kind: 'file',
        bytes: images.write(conversion.engineFormat, (data) => new Uint8Array(data)),
      }
    },
  )

  if (!output?.bytes?.length) throw new Error('ImageMagick produced an empty output file.')
  if (output.kind === 'frames') {
    return {
      bytes: output.bytes,
      filename: convertedFilename(file.name, `${conversion.targetExtension}-frames.zip`),
      mime: 'application/zip',
    }
  }
  return {
    bytes: output.bytes,
    filename: convertedFilename(file.name, conversion.targetExtension),
    mime: conversion.targetMime || 'application/octet-stream',
  }
}
