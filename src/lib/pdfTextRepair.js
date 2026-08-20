export function repairPdfTextSpacing(value) {
  const suffixFragments = new Set([
    'ability', 'ibility', 'able', 'agement', 'ally', 'ation', 'bution', 'cation',
    'ed', 'er', 'ers', 'est', 'ful', 'graphy', 'ibility', 'ible', 'ically',
    'ibution', 'ing', 'ition', 'itive', 'ive', 'less', 'ly', 'ment', 'ness',
    'ology', 'ous', 'ship', 'sion', 'tion', 'ution', 'ward', 'wards',
  ])
  return String(value || '').replace(/\b([A-Za-z]{2,})\s+([a-z]+)\b/g, (match, left, right) => {
    const fragment = right.toLowerCase()
    const strandedLetter = fragment.length === 1 && left.length <= 4 && !/^[ai]$/.test(fragment)
    return strandedLetter || suffixFragments.has(fragment) ? `${left}${right}` : match
  })
}
