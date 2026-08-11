export const PSD_RESOURCE_LIMITS = {
  width: 12_000,
  height: 12_000,
  pixels: 64_000_000,
  layers: 1_200,
}

export function flattenPsdLayers(layers = [], depth = 0, rows = []) {
  for (const layer of layers) {
    rows.push({
      depth,
      name: layer.name || 'Untitled layer',
      type: layer.children?.length ? 'Group' : layer.text ? 'Text' : 'Layer',
      visible: layer.hidden ? 'No' : 'Yes',
      opacity: Math.round((layer.opacity ?? 1) * 100),
      blendMode: layer.blendMode || 'normal',
      bounds: [layer.left, layer.top, layer.right, layer.bottom].every(Number.isFinite)
        ? `${layer.left}, ${layer.top} → ${layer.right}, ${layer.bottom}`
        : '',
      text: layer.text?.text || '',
    })
    if (layer.children?.length) flattenPsdLayers(layer.children, depth + 1, rows)
  }
  return rows
}

export function assertPsdFidelityLimits(psd, layers, limits = PSD_RESOURCE_LIMITS) {
  if ((psd.bitsPerChannel || 8) > 8) {
    throw new Error(`This ${psd.bitsPerChannel}-bit PSD needs a high-precision compositor. The local 8-bit canvas stopped instead of reducing its colour precision.`)
  }
  if (psd.width > limits.width || psd.height > limits.height || psd.width * psd.height > limits.pixels) {
    throw new Error(`This PSD is too large for safe in-browser conversion (maximum ${limits.pixels / 1_000_000} megapixels). It was not resized.`)
  }
  if (layers.length > limits.layers) {
    throw new Error(`This PSD has more than ${limits.layers.toLocaleString()} layers, which is too large for safe in-browser conversion. No layers were omitted.`)
  }
}
