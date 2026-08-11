/*
 * Directional conversion capabilities.
 *
 * A MIME registration only says that an extension exists. It does not say that
 * a decoder or encoder exists, so the catalogue below is deliberately tied to
 * named engines and versions. `ready` means the engine runs in this browser;
 * `engine-required` means the conversion is real and documented, but needs the
 * named native/WASM engine before the Convert button can be enabled.
 */

const words = (value) => value.trim().split(/\s+/).filter(Boolean)
const wordSet = (value) => new Set(words(value))

export const ENGINE_CATALOG = {
  imagemagick: {
    label: 'ImageMagick WASM',
    version: '7.1.2-25 / magick-wasm 0.0.41',
    source: 'https://imagemagick.org/formats/',
    availability: 'ready',
  },
  pandoc: {
    label: 'Pandoc WASM',
    version: '3.10 / pandoc-wasm 1.1.0',
    source: 'https://pandoc.org/MANUAL.html',
    availability: 'ready',
  },
  ffmpeg: {
    label: 'FFmpeg',
    version: '8.1.1 full build capability audit',
    source: 'https://ffmpeg.org/ffmpeg-formats.html',
    availability: 'engine-required',
  },
  libreoffice: {
    label: 'LibreOffice',
    version: 'directional filter catalogue',
    source: 'https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html',
    availability: 'engine-required',
  },
  calibre: {
    label: 'Calibre',
    version: 'ebook-convert format catalogue',
    source: 'https://manual.calibre-ebook.com/conversion.html',
    availability: 'engine-required',
  },
  sevenzip: {
    label: '7-Zip',
    version: '24.x format matrix',
    source: 'https://www.7-zip.org/',
    availability: 'engine-required',
  },
  assimp: {
    label: 'Assimp',
    version: '5.x import/export matrix',
    source: 'https://github.com/assimp/assimp/blob/master/doc/Fileformats.md',
    availability: 'engine-required',
  },
  openbabel: {
    label: 'Open Babel',
    version: '3.x format matrix',
    source: 'https://openbabel.org/docs/FileFormats/Overview.html',
    availability: 'engine-required',
  },
  gdal: {
    label: 'GDAL/OGR',
    version: '3.x Create/CreateCopy driver matrix',
    source: 'https://gdal.org/en/stable/drivers/',
    availability: 'engine-required',
  },
  fontforge: {
    label: 'FontForge',
    version: 'Generate() output matrix',
    source: 'https://fontforge.org/docs/scripting/scripting-alpha.html',
    availability: 'engine-required',
  },
}

// Values captured from Magick.supportedFormats in the exact bundled WASM.
export const MAGICK_DECLARED_READERS = wordSet(`
  3FR 3G2 3GP A AAI AI APNG ART ARW AVI AVIF AVS B BAYER BAYERA BGR BGRA BGRO BMP BMP2 BMP3 C CAL CALS CANVAS CAPTION CIN CLIP CMYK CMYKA CR2 CR3 CRW CUBE CUR CUT DATA DCM DCR DCRAW DCX DDS DFONT DNG DPX DXT1 DXT5 EPDF EPI EPS EPSF EPSI EPT EPT2 EPT3 ERF EXR FARBFELD FAX FF FFF FILE FITS FL32 FLV FRACTAL FTS FTXT G G3 G4 GIF GIF87 GRADIENT GRAY GRAYA GROUP4 HALD HDR HEIC HEIF HRZ HTTP HTTPS ICB ICN ICO ICON IIQ INLINE IPL J2C J2K JNG JNX JP2 JPC JPE JPEG JPG JPM JPS JPT JXL K K25 KDC LABEL M M2V M4V MAC MAP MASK MAT MDC MEF MIFF MKV MNG MONO MOS MOV MP4 MPC MPEG MPG MPO MRW MSL MSVG MTV MVG NEF NRW NULL O ORF OTB OTF PAL PALM PAM PATTERN PBM PCD PCDS PCL PCT PCX PDB PDF PDFA PEF PES PFA PFB PFM PGM PGX PHM PICON PICT PIX PJPEG PLASMA PNG PNG00 PNG24 PNG32 PNG48 PNG64 PNG8 PNM POCKETMOD PPM PS PSB PSD PTIF PWP QOI R RADIAL-GRADIENT RAF RAS RAW RGB RGB565 RGBA RGBO RGF RLA RLE RMF RW2 RWL SCR SCREENSHOT SCT SF3 SFW SGI SIX SIXEL SR2 SRF SRW STEGANO STI STRIMG SUN SVG SVGZ TEXT TGA TIFF TIFF64 TILE TIM TM2 TTC TTF TXT UYVY VDA VICAR VID VIFF VIPS VST WBMP WEBM WEBP WMV WPG X3F XBM XC XCF XPM XPS XV Y YCBCR YCBCRA YUV
`)

export const MAGICK_DECLARED_WRITERS = wordSet(`
  A AAI AI APNG ART ASHLAR AVIF AVS B BAYER BAYERA BGR BGRA BGRO BMP BMP2 BMP3 BRF C CAL CALS CIN CIP CLIP CMYK CMYKA CUR DATA DCX DDS DPX DXT1 DXT5 EPDF EPI EPS EPS2 EPS3 EPSF EPSI EPT EPT2 EPT3 EXR FARBFELD FAX FF FITS FL32 FLV FTS FTXT G G3 G4 GIF GIF87 GRAY GRAYA GROUP4 HDR HISTOGRAM HRZ HTM HTML ICB ICN ICO ICON INFO INLINE IPL ISOBRL ISOBRL6 J2C J2K JNG JP2 JPC JPE JPEG JPG JPM JPS JPT JSON JXL K M M2V M4V MAP MASK MAT MATTE MIFF MKV MNG MONO MOV MP4 MPC MPEG MPG MSVG MTV MVG NULL O OTB PAL PALM PAM PBM PCD PCDS PCL PCT PCX PDB PDF PDFA PFM PGM PGX PHM PICON PICT PJPEG PNG PNG00 PNG24 PNG32 PNG48 PNG64 PNG8 PNM POCKETMOD PPM PS PS2 PS3 PSB PSD PTIF QOI R RAS RGB RGBA RGBO RGF SF3 SGI SHTML SIX SIXEL SPARSE-COLOR STRIMG SUN SVG SVGZ TGA THUMBNAIL TIFF TIFF64 TXT UBRL UBRL6 UIL UYVY VDA VICAR VID VIFF VIPS VST WBMP WEBM WEBP WMV WPG XBM XPM XV Y YAML YCBCR YCBCRA YUV
`)

// A one-pixel write/read probe removes entries that only advertise a missing
// delegate. Input-only camera RAW coders remain visible as engine-required.
export const MAGICK_READY_READERS = wordSet(`
  AAI ART AVIF AVS BMP BMP2 BMP3 CIN CUR DCX DDS DPX DXT1 DXT5 EXR FARBFELD FAX FF FITS FL32 FTS G3 GIF GIF87 HDR HRZ ICB ICN ICO ICON J2C J2K JNG JP2 JPC JPE JPEG JPG JPM JPS JXL MAT MIFF MNG MPC MTV OTB PALM PAM PBM PCD PCDS PCT PCX PDB PFM PGM PGX PHM PICON PICT PJPEG PNG PNG00 PNG24 PNG32 PNG48 PNG64 PNG8 PNM PPM PSB PSD PTIF QOI RAS SF3 SGI SIX SIXEL SUN TGA TIFF TIFF64 TXT VDA VICAR VIFF VIPS VST WBMP WEBP WPG XBM XPM XV
`)

export const MAGICK_READY_WRITERS = wordSet(`
  AAI AI ART AVIF AVS B BGR BGRA BGRO BMP BMP2 BMP3 BRF CAL CALS CIN CIP CMYK CMYKA CUR DCX DDS DPX DXT1 DXT5 EPDF EPI EPS EPS2 EPS3 EPSF EPSI EPT EPT2 EPT3 EXR FARBFELD FAX FF FITS FL32 FTS FTXT G G3 G4 GIF GIF87 GRAY GRAYA GROUP4 HDR HRZ HTML ICB ICN ICO ICON INFO IPL ISOBRL ISOBRL6 J2C J2K JNG JP2 JPC JPE JPEG JPG JPM JPS JSON JXL MAP MAT MIFF MNG MONO MPC MSVG MTV OTB PAL PALM PAM PBM PCD PCDS PCL PCT PCX PDB PDF PDFA PFM PGM PGX PHM PICON PICT PJPEG PNG PNG00 PNG24 PNG32 PNG48 PNG64 PNG8 PNM PPM PS PS2 PS3 PSB PSD PTIF QOI R RAS RGB RGBA RGBO RGF SF3 SGI SHTML SIX SIXEL SPARSE-COLOR STRIMG SUN SVG SVGZ TGA TIFF TIFF64 TXT UBRL UBRL6 UIL UYVY VDA VICAR VIFF VIPS VST WBMP WEBP WPG XBM XPM XV YAML YCBCR YCBCRA YUV
`)

const MAGICK_CODER_ALIASES = {
  jpeg: 'JPEG', jpg: 'JPEG', jpe: 'JPEG', jfif: 'JPEG', jif: 'JPEG', jfi: 'JPEG',
  tif: 'TIFF', tiff: 'TIFF', fits: 'FITS', fts: 'FITS',
  jp2: 'JP2', j2c: 'J2C', j2k: 'J2K', jpc: 'JPC',
  pbm: 'PBM', pgm: 'PGM', ppm: 'PPM', pnm: 'PNM', pam: 'PAM',
  ico: 'ICO', icon: 'ICO', psb: 'PSB', psd: 'PSD',
}

const MAGICK_TARGET_ALIASES = {
  BMP2: 'bmp', BMP3: 'bmp', EPDF: 'pdf', EPS2: 'eps', EPS3: 'eps',
  EPT2: 'ept', EPT3: 'ept', FITS: 'fits', FTS: 'fits', GIF87: 'gif',
  GROUP4: 'g4', HTM: 'html', HTML: 'html', ICON: 'ico',
  JPE: 'jpeg', JPEG: 'jpeg', JPG: 'jpg', PJPEG: 'jpg',
  MSVG: 'svg', PNG00: 'png', PNG24: 'png', PNG32: 'png', PNG48: 'png',
  PNG64: 'png', PNG8: 'png', PS2: 'ps', PS3: 'ps',
  SHTML: 'html', TIFF: 'tiff', TIFF64: 'tiff', YAML: 'yaml',
}

const MAGICK_PSEUDO_TARGETS = new Set([
  'ASHLAR', 'DATA', 'HISTOGRAM', 'INFO', 'INLINE', 'NULL', 'SPARSE-COLOR', 'THUMBNAIL',
])

export function magickCoderForExtension(extension) {
  const clean = extension.replace(/^\./, '').toLowerCase()
  return MAGICK_CODER_ALIASES[clean] || clean.toUpperCase()
}

function magickTargetExtension(coder) {
  return MAGICK_TARGET_ALIASES[coder] || coder.toLowerCase()
}

function uniqueMagickTargets() {
  const byExtension = new Map()
  for (const coder of MAGICK_DECLARED_WRITERS) {
    if (MAGICK_PSEUDO_TARGETS.has(coder)) continue
    const extension = magickTargetExtension(coder)
    const candidate = {
      extension,
      engineFormat: coder,
      availability: MAGICK_READY_WRITERS.has(coder) ? 'ready' : 'engine-required',
    }
    const existing = byExtension.get(extension)
    if (!existing || (candidate.availability === 'ready' && existing.availability !== 'ready')) {
      byExtension.set(extension, candidate)
    }
  }
  return [...byExtension.values()].sort((a, b) => a.extension.localeCompare(b.extension))
}

export const MAGICK_TARGETS = uniqueMagickTargets()

export const PANDOC_INPUT_FORMATS = {
  adoc: 'asciidoc', asciidoc: 'asciidoc', bib: 'biblatex', bits: 'bits',
  creole: 'creole', csv: 'csv', dj: 'djot', djot: 'djot', dbk: 'docbook', docbook: 'docbook',
  docx: 'docx', dokuwiki: 'dokuwiki', epub: 'epub', fb2: 'fb2', haddock: 'haddock',
  html: 'html', htm: 'html', ipynb: 'ipynb', jira: 'jira', latex: 'latex', tex: 'latex',
  man: 'man', markdown: 'markdown', md: 'markdown', mdown: 'markdown', mkd: 'markdown',
  mdoc: 'mdoc', mediawiki: 'mediawiki', muse: 'muse', native: 'native', odt: 'odt',
  opml: 'opml', org: 'org', pod: 'pod', pptx: 'pptx', ris: 'ris', rst: 'rst', rtf: 'rtf',
  t2t: 't2t', textile: 'textile', tikiwiki: 'tikiwiki', tsv: 'tsv', twiki: 'twiki',
  typ: 'typst', typst: 'typst', vimwiki: 'vimwiki', xlsx: 'xlsx',
}

// Every writer reported by Pandoc 3.10 is represented. Several dialects share
// an extension; the most modern/general writer is selected for that extension.
export const PANDOC_TARGETS = [
  ['ansi', 'ansi'], ['adoc', 'asciidoctor'], ['bbcode', 'bbcode'], ['tex', 'latex'],
  ['bib', 'biblatex'], ['md', 'commonmark_x'], ['json', 'json'], ['djot', 'djot'],
  ['dbk', 'docbook5'], ['docx', 'docx'], ['dokuwiki', 'dokuwiki'], ['html', 'html5'],
  ['epub', 'epub3'], ['fb2', 'fb2'], ['haddock', 'haddock'], ['icml', 'icml'],
  ['ipynb', 'ipynb'], ['xml', 'jats'], ['jira', 'jira'], ['man', 'man'],
  ['markua', 'markua'], ['mediawiki', 'mediawiki'], ['ms', 'ms'], ['muse', 'muse'],
  ['native', 'native'], ['odt', 'odt'], ['fodt', 'opendocument'], ['opml', 'opml'],
  ['org', 'org'], ['pdf', 'pdf', 'engine-required'], ['txt', 'plain'], ['pptx', 'pptx'],
  ['rst', 'rst'], ['rtf', 'rtf'], ['tei', 'tei'], ['texi', 'texinfo'],
  ['textile', 'textile'], ['typ', 'typst'], ['vimdoc', 'vimdoc'], ['xwiki', 'xwiki'],
  ['zimwiki', 'zimwiki'],
].map(([extension, engineFormat, availability = 'ready']) => ({ extension, engineFormat, availability }))

// Captured from `ffmpeg -demuxers/-muxers` and every format's "Common
// extensions" line in FFmpeg 8.1.1. The list is directional: inputs come only
// from demuxers and outputs only from muxers.
export const FFMPEG_INPUT_EXTENSIONS = wordSet(`
  264 265 266 302 3g2 3gp 669 722 aa aa3 aac aax abc ac3 ac4 acm adf adp ads adx aea afc aix al amf ams ans apc ape apl aptx aptxhd apv aqt art asc ast avc avi avif avr avs avs2 avs3 bcstm bfstm binka bit bitpacked bmv bonk brstm c2 cdata cdg cdxl cgi cif dat daud dav dbm dfpwm dif digi diz dmf dsm dss dtk dtm dts dtshd dv eac3 ec3 evc f4v fap far flac flm flv fsb fwse g722 g723_1 g728 g729 gdm genh gif gsm h261 h264 h265 h266 h26l hca heic heif hevc iamf ice idf idx ifv imf imx ipu ircam ism isma ismv it itgz itr itz ivr j2b j2k jxl kux laf lc3 lvf m15 m2a m4a m4b m4v mac mca mcc mdgz mdl mdr mdz med mid mj2 mjpeg mjpg mk3d mka mks mkv mlp mmcmp mms mo3 mod mods moflex mov mp2 mp3 mp4 mpa mpc mpl2 mpo mptm msbc msf mt2 mtaf mtm musx mvi mxg nfo nist nsp nst nut obu ogg okt oma omg osq paf pdv pjs plm ppm psm psp pt36 ptm pvf qcif qoa rco rcv rgb rka rsd rso rt s3gz s3m s3r s3z sami sb sbc sbg scc sdns sdr2 sds sdx ser sf sfx sfx2 sga shn sln smi son sph ss2 st26 stk stl stm stp str sub sup svag svs sw tak tco thd tta txt ty ty+ ub ul ult umx usm uw v v210 vag vb vc1 viv vpk vqe vqf vql vt vtt vvc wa way webm webvtt wow wsd xl xm xmd xmgz xmr xmv xmz xpk xvag y4m yop yuv yuv10
`)

export const FFMPEG_OUTPUT_EXTENSIONS = words(`
  264 265 266 302 3g2 3gp a64 aac ac3 ac4 adts adx aea afc aif aifc aiff al amr amv apm apng aptx aptxhd apv asf ass ast au aud avi avif avs avs2 avs3 bit bmp c2 caf cavs chk cpk cvg dfpwm dnxhd dnxhr dpx drc dts dv dvd eac3 ec3 evc exr f4v ffmeta fits flac flm flv g722 gif gsm gxf h261 h263 h264 h265 h266 hdr hevc iamf ico im1 im24 im8 ircam isma ismv ivf j2c j2k jls jp2 jpeg jpg js jss jxl jxs latm lbc lc3 ljpg loas lrc m1v m2a m2t m2ts m2v m3u8 m4a m4b m4v mcc mjpeg mjpg mkv mlp mmf mov mp2 mp3 mp4 mpa mpd mpeg mpg msbc mts mxf nut obu oga ogg ogv oma opus pam pbm pcm pcx pfm pgm pgmyuv phm pix png ppm psp qoi ra ras rco rcv rgb rm roq rs rso sb sbc scc sf sgi sox spdif spx srt ssa sub sun sunras sup sw swf tco tga thd tif tiff ts tta ttml tun ub ul uw vag vbn vc1 vc2 vob voc vtt vvc w64 wav wbmp webm webp wma wmv wtv wv xbm xface xml xwd y y4m yuv
`)

const profile = (id, engine, inputs, outputs, options = {}) => ({
  id,
  engine,
  inputs: new Set(inputs),
  outputs: [...new Set(outputs)],
  availability: ENGINE_CATALOG[engine].availability,
  ...options,
})

export const DIRECTIONAL_PROFILES = [
  profile('ffmpeg-media', 'ffmpeg', FFMPEG_INPUT_EXTENSIONS, FFMPEG_OUTPUT_EXTENSIONS, {
    categories: new Set(['audio', 'video', 'images']),
  }),
  profile(
    'libreoffice-writer', 'libreoffice',
    words('doc docx docm dot dotx dotm odt ott fodt rtf sxw xml wpd pages'),
    words('doc docx odt ott fodt rtf txt html xhtml pdf epub'),
  ),
  profile(
    'libreoffice-calc', 'libreoffice',
    words('xls xlsx xlsm xlsb xlt xltx xltm ods ots fods csv tsv dbf dif slk numbers'),
    words('xls xlsx ods ots fods csv tsv dbf dif slk html xhtml pdf'),
  ),
  profile(
    'libreoffice-impress', 'libreoffice',
    words('ppt pptx pptm pps ppsx ppsm pot potx potm odp otp fodp sxi key'),
    words('ppt pptx odp otp fodp pdf html xhtml svg png jpg'),
  ),
  profile(
    'libreoffice-draw', 'libreoffice',
    words('odg otg fodg sxd vsd vsdx vdx pub wmf emf'),
    words('odg fodg pdf svg eps emf wmf png jpg'),
  ),
  profile(
    'calibre-ebooks', 'calibre',
    words('azw azw3 azw4 cbc cbr cbz chm djv djvu docx epub fb2 fbz html htmlz lit lrf md mobi odt pdb pdf pml prc rb rtf snb tcr txt txtz'),
    words('azw3 epub docx fb2 htmlz lit lrf mobi oeb pdb pmlz rb rtf snb tcr txt txtz zip'),
  ),
  profile(
    'sevenzip-archives', 'sevenzip',
    words('7z apfs ar arj bz2 bzip2 cab chm cpio crx dmg ext fat gz gzip hfs iso lha lzh lzma mbr msi nsis ntfs qcow qcow2 rar rpm squashfs swm tar udf vdi vhd vhdx vmdk wim xar xz z zip zst'),
    words('7z zip tar wim tgz tbz2 txz'),
  ),
  profile(
    'assimp-3d', 'assimp',
    words('3d 3ds 3mf ac ac3d acc amf ase ask assbin b3d blend bvh cob dae dxf enff fbx glb gltf hmp ifc ifczip irr irrmesh lwo lws lxo md2 md3 md5anim md5camera md5mesh mdc mdl mesh meshxml mot ms3d ndo nff obj off ogex pk3 ply pmx prj q3o q3s raw scn sib smd step stl stp ter uc vta x x3d x3db xgl xml zae zgl'),
    words('dae stl obj ply x 3ds json assbin step pbrt gltf glb 3mf fbx'),
  ),
  profile(
    'openbabel-chemistry', 'openbabel',
    words('abinit acesin acesout adf alc ascii bgf box bs c3d1 c3d2 cac cache car ccc cdx cdxml cif ck cml confab copy crk2d crk3d csr cssr ct dmol dx ent exyz fa fasta fh fhi fract fs gam gamin gamout got gro gukin gukout gzmat hin inchi inp jag jout mdl mmcif mol mol2 molden mop mopcrt mopout mpc mrv msi nw nwo pdb pdbqt png pov pqr pqs qcin qcout report res rxn sdf smi smiles sy2 tdd therm tmol txt unixyz vmd xed xml xyz yob zindo'),
    words('alc ascii bgf box bs c3d1 c3d2 cac cache can car cdx cdxml cif ck cml copy crk2d crk3d csr cssr ct dmol dx ent exyz fa fasta fh fhi fract fs gam gamin got gro gukin gzmat hin inchi inchikey inp jag mdl mmcif mol mol2 molden mop mopcrt mpc mrv msi nw pdb pdbqt pov pqr pqs qcin report res rxn sdf smi smiles svg sy2 tdd therm tmol txt unixyz vmd xed xml xyz yob zindo'),
  ),
  profile(
    'gdal-raster', 'gdal',
    words('adf asc bag bil blx bmp bt cal ceos cub dat dcm dem dim dted ecw ers exr fits gen gff gif grb grib grib2 grd gri grib hdf hdf4 hdf5 hdr heic heif img j2c j2k jp2 jpc jpeg jpg jxl kap kml kmz lbl mbtiles mem mff mrf nc netcdf nitf ntf pdf png pnm qoi ras raw rgb rrd rst rsw saga sdat sid tif tiff vrt webp xpm xyz'),
    words('aaigrid asc bag bil blx bmp bt cog csv dted ecw ers exr fits gif gpkg grb grib grib2 hdr hdf5 img jp2 jpeg jpg jxl kml kmz mbtiles mrf nc netcdf nitf ntf pdf png pnm qoi raw rgb rst saga sdat tif tiff vrt webp xpm xyz'),
  ),
  profile(
    'gdal-vector', 'gdal',
    words('bna csv dgn dxf e00 gdb geojson geojsonl gml gmlas gmt gpkg gpx jml json kml kmz map mif mvt ods osm pbf pdf shp sqlite tab topojson vrt xls xlsx'),
    words('bna csv dgn dxf flatgeobuf fgb geojson geojsonl georss gml gmt gpkg gpx json kml kmz mapinfo mif mvt ods parquet pdf pgdump shp sqlite tab topojson vrt xls xlsx'),
  ),
  profile(
    'fontforge-fonts', 'fontforge',
    words('bdf bin cff cid dfont eot fon fnt otf pcf pfa pfb ps pt3 sfd svg t42 ttc ttf ufo woff woff2'),
    words('pfa pfb bin res pt3 ps t42 cid cff ttf dfont otf svg type3 multilayer'),
  ),
]

export function profilesForExtension(extension, categoryId) {
  const clean = extension.replace(/^\./, '').toLowerCase()
  return DIRECTIONAL_PROFILES.filter((item) =>
    item.inputs.has(clean) && (!item.categories || item.categories.has(categoryId)),
  )
}
