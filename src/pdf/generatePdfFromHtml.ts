// src/pdf/generatePdfFromHtml.ts

/**
 * Converts an HTML string into a PDF Blob using html2pdf.js
 */
export async function generatePdfFromHtml(html: string): Promise<Blob> {
  const container = document.createElement("div");
  container.innerHTML = html;

  const options = {
    margin: 0,
    filename: "report.pdf",
    html2canvas: {
      scale: 2,
      letterRendering: true,
      useCORS: true,
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait" as const,
    },
  };

  const html2pdf = (await import("html2pdf.js")).default as any;

  const pdfBlob: Blob = await html2pdf()
    .set(options)
    .from(container)
    .outputPdf("blob");

  return pdfBlob;
}
