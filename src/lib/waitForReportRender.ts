/** Wait until an export host has measurable content (charts, tiles, etc.). */
export async function waitForReportRender(
  host: HTMLElement,
  minHeightPx = 400,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const doc = host.querySelector(".cp-full-report-document");
    const target = (doc as HTMLElement | null) ?? host;
    const height = target.scrollHeight || target.offsetHeight;
    if (height >= minHeightPx) return;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100)));
  }
  const final = host.querySelector(".cp-full-report-document") ?? host;
  const h = (final as HTMLElement).scrollHeight;
  if (h < minHeightPx) {
    throw new Error("Full report did not finish rendering. Try again.");
  }
}
