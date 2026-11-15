// The PDF library, loaded only when a PDF is opened or read (it is large). Shared by the viewer and the manual reader.
let lib = null
export async function loadPdfLib() {
  if (!lib) {
    // The "legacy" build also works on older phones.
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')])
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    lib = pdfjs
  }
  return lib
}
