import puppeteer from "puppeteer";

/**
 * Renders HTML content inside a headless Chromium page and generates A4 print-safe PDF.
 *
 * @param {string} htmlContent - HTML markup representing the template.
 * @returns {Promise<Buffer>} - Buffer containing the generated PDF binary.
 */
export async function generatePdfFromHtml(htmlContent) {
  // Launch Puppeteer with safe flags
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  try {
    const page = await browser.newPage();
    // Inject the fully built HTML
    await page.setContent(htmlContent, { waitUntil: "load" });

    // Generate print-safe PDF formatted to A4 with 20mm margins
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm"
      }
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
