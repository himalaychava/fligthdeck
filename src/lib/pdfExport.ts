import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

const PDF_WIDTH_MM = 210;
const PDF_HEIGHT_MM = 297;
const MARGIN_MM = 8;

export interface PdfExportOptions {
  filename: string;
  /** When false, PDF is a pure visual snapshot (no extra text header). Default true for snapshots. */
  snapshotOnly?: boolean;
  titleLines?: string[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function defaultReportFilename(clientName: string, pageLabel: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slugify(clientName)}-${slugify(pageLabel)}-${stamp}.pdf`;
}

/** Match main content column width so layout matches the live page. */
export function getReportCaptureWidthPx(): number {
  const content = document.querySelector(".cp-content");
  if (content) {
    return Math.round(content.getBoundingClientRect().width);
  }
  return Math.min(1200, document.documentElement.clientWidth - 48);
}

function hideExportChrome(root: HTMLElement): () => void {
  const hidden: { el: HTMLElement; display: string }[] = [];
  root.querySelectorAll("[data-hide-in-report]").forEach((node) => {
    const el = node as HTMLElement;
    hidden.push({ el, display: el.style.display });
    el.style.display = "none";
  });
  return () => {
    hidden.forEach(({ el, display }) => {
      el.style.display = display;
    });
  };
}

async function captureElementSnapshot(element: HTMLElement): Promise<HTMLCanvasElement> {
  const restoreHidden = hideExportChrome(element);
  element.classList.add("cp-report-capturing");

  const width = element.scrollWidth || element.offsetWidth;
  const height = element.scrollHeight || element.offsetHeight;

  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }

  if (width < 2 || height < 2) {
    throw new Error("Nothing to capture — content area is empty.");
  }

  try {
    return await toCanvas(element, {
      cacheBust: true,
      pixelRatio: Math.min(2, window.devicePixelRatio || 2),
      width,
      height,
      backgroundColor: "#ffffff",
      style: {
        width: `${width}px`,
        height: `${height}px`,
        margin: "0",
        padding: getComputedStyle(element).padding,
        background: "#ffffff",
        transform: "none",
      },
      filter: (node) => {
        if (node instanceof HTMLElement && node.dataset.hideInReport !== undefined) {
          return false;
        }
        return true;
      },
    });
  } finally {
    element.classList.remove("cp-report-capturing");
    restoreHidden();
  }
}

/** Slice a tall canvas into A4 pages without stretching text. */
function addCanvasToPdf(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  startYMm: number
): void {
  const pageWidthMm = PDF_WIDTH_MM - MARGIN_MM * 2;
  const firstPageHeightMm = PDF_HEIGHT_MM - startYMm - MARGIN_MM;
  const nextPageHeightMm = PDF_HEIGHT_MM - MARGIN_MM * 2;

  const imgWidthMm = pageWidthMm;
  const fullImgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  const sliceCanvas = document.createElement("canvas");
  const ctx = sliceCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < canvas.height) {
    const pageBodyMm = pageIndex === 0 ? firstPageHeightMm : nextPageHeightMm;
    const sliceHeightPx = Math.floor((pageBodyMm * canvas.width) / imgWidthMm);
    const actualSlicePx = Math.min(sliceHeightPx, canvas.height - sourceY);
    if (actualSlicePx <= 0) break;

    if (pageIndex > 0) pdf.addPage();

    sliceCanvas.width = canvas.width;
    sliceCanvas.height = actualSlicePx;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      actualSlicePx,
      0,
      0,
      canvas.width,
      actualSlicePx
    );

    const sliceHeightMm = (actualSlicePx * imgWidthMm) / canvas.width;
    const topMm = pageIndex === 0 ? startYMm : MARGIN_MM;
    pdf.addImage(
      sliceCanvas.toDataURL("image/png"),
      "PNG",
      MARGIN_MM,
      topMm,
      imgWidthMm,
      sliceHeightMm
    );

    sourceY += actualSlicePx;
    pageIndex += 1;

    if (sourceY >= canvas.height) break;
    if (pageIndex > 80) break;
  }

  void fullImgHeightMm;
}

/** Visual snapshot export — WYSIWYG match to on-screen layout. */
export async function exportElementToPdf(
  element: HTMLElement,
  options: PdfExportOptions
): Promise<void> {
  const { filename, snapshotOnly = true, titleLines = [] } = options;

  const canvas = await captureElementSnapshot(element);
  if (canvas.width < 2 || canvas.height < 2) {
    throw new Error("Export produced an empty image. Please try again.");
  }
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let startY = MARGIN_MM;
  if (!snapshotOnly && titleLines.length) {
    pdf.setFontSize(14);
    titleLines.forEach((line) => {
      pdf.text(line, MARGIN_MM, startY);
      startY += 7;
    });
    startY += 4;
  }

  addCanvasToPdf(pdf, canvas, startY);
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export function waitForPaint(ms = 400): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, ms);
    });
  });
}

/** Mount full-report content at the same width as the live content area before capture. */
export function applyReportHostLayout(host: HTMLElement): void {
  const width = getReportCaptureWidthPx();
  host.style.width = `${width}px`;
  host.style.maxWidth = `${width}px`;
  host.style.minHeight = "1px";
  host.style.background = "#ffffff";
  host.style.boxSizing = "border-box";
  host.style.overflow = "visible";
}

/** Target element to snapshot for full client report (inner document, not empty host). */
export function getFullReportCaptureTarget(host: HTMLElement): HTMLElement {
  return (host.querySelector(".cp-full-report-document") as HTMLElement | null) ?? host;
}
