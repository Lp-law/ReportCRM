// src/pdf/buildReportHtml.ts
import templateHtml from "../assets/template.html?raw";
import templateCss from "../assets/template.css?raw";
import logoTop from "../assets/branding/logo-top.png";
import logoBottom from "../assets/branding/logo-bottom.png";
import signature from "../assets/branding/signature.png";

import type { ReportData, InvoiceFile } from "../types";
import { getFinancialExpenseSheetWithRelations, getOfficialSheetIdForCase } from "../services/financialExpensesData";
import { renderExpensesTableHtml } from "../utils/expensesTableText";
import { financialExpensesClient } from "../services/financialExpensesClient";
import { normalizeOdakanitNo } from "../utils/normalizeOdakanitNo";

function escapeHtml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()}`;
}

function buildRecipientBlock(report: ReportData): string {
  const lines: string[] = [];

  if (report.insurerName) lines.push(`<div>${escapeHtml(report.insurerName)}</div>`);
  if (report.adjusterName) lines.push(`<div>${escapeHtml(report.adjusterName)}</div>`);
  if (report.adjusterEmail) lines.push(`<div>${escapeHtml(report.adjusterEmail)}</div>`);

  return lines.join("");
}

function buildReBlock(report: ReportData): string {
  const parts: string[] = [];

  if (report.insuredName) parts.push(`Insured: ${escapeHtml(report.insuredName)}`);
  if (report.plaintiffName)
    parts.push(`Plaintiff: ${escapeHtml(report.plaintiffName)}`);
  if (report.claimNumber)
    parts.push(`Claim Number: ${escapeHtml(report.claimNumber)}`);

  if ((report as any).policyPeriod)
    parts.push(`Policy Period: ${escapeHtml((report as any).policyPeriod)}`);

  if ((report as any).retroactiveDate)
    parts.push(`Retroactive Date: ${escapeHtml((report as any).retroactiveDate)}`);

  return parts.join("<br/>");
}

function buildPreviousReports(report: ReportData): string {
  if (!Array.isArray(report.reportHistory)) return "";

  return report.reportHistory
    .map((h, index) => {
      const num = index + 1;
      const dt = h.timestamp
        ? formatDate(new Date(h.timestamp).toISOString())
        : "";
      return `<p><strong>Report ${num}:</strong> ${dt}</p>`;
    })
    .join("");
}

function buildMainSections(report: ReportData): string {
  const s: any = (report as any).sections || {};
  const htmlParts: string[] = [];

  const pushSection = (title: string, value?: string) => {
    if (!value) return;
    htmlParts.push(
      `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(value).replace(/\n/g, "<br/>")}</p>`
    );
  };

  pushSection("Update", s.update);
  pushSection("Strategy", s.strategy);
  pushSection("Risk Assessment", s.riskAssessment);
  pushSection("Expert Opinion", s.expertOpinion);
  pushSection("Coverage Analysis", s.coverageAnalysis);
  pushSection("Next Steps", s.nextSteps);

  // Expenses – use report's linked sheet if set, else official sheet for case (source of truth)
  const caseId = (report as any).odakanitNo as string | undefined;
  if (caseId) {
    const normalizedCase = normalizeOdakanitNo(caseId);
    const linkedSheetId = (report as any).expensesSheetId as string | undefined;
    const linkedExists = linkedSheetId && getFinancialExpenseSheetWithRelations(linkedSheetId);
    const sheetId = linkedExists ? linkedSheetId : getOfficialSheetIdForCase(caseId);

    if (sheetId) {
      const relations = getFinancialExpenseSheetWithRelations(sheetId);
      const snapshot = financialExpensesClient.buildCumulativeExpensesSnapshot(
        sheetId,
        new Date().toISOString(),
      );
      if (snapshot && relations) {
        const { effectiveSheet, allLines, opts } = snapshot;
        const { html } = renderExpensesTableHtml(effectiveSheet, allLines, opts);
        if (html) {
          let sectionHtml = `<h2>Expenses</h2>${html}`;

          const attachments = relations.attachments || [];
          if (attachments.length) {
            const appendixParts: string[] = [];
            appendixParts.push('<h2>Appendix – Invoices</h2>');

            attachments.forEach((att, index) => {
              const fileKey = att.fileKey;
              const mime = att.mimeType || '';
              const isImage = mime.startsWith('image/');
              const isPdf =
                mime === 'application/pdf' ||
                mime === 'application/x-pdf' ||
                mime === 'application/octet-stream';
              const captionBase =
                att.originalFileName && att.originalFileName.trim().length > 0
                  ? `Invoice ${index + 1} – ${att.originalFileName.trim()}`
                  : `Invoice ${index + 1}`;
              const caption = escapeHtml(captionBase);

              if (isImage) {
                appendixParts.push(
                  `<div class="appendix-item"><img src="${fileKey}" class="appendix-image" alt="${caption}" />` +
                    `<div class="appendix-caption">${caption}</div></div>`,
                );
              } else if (isPdf) {
                appendixParts.push(
                  `<div class="appendix-item"><object data="${fileKey}" type="${mime ||
                    'application/pdf'}" class="appendix-pdf">` +
                    `<p class="appendix-caption">${caption}</p></object></div>`,
                );
              } else {
                appendixParts.push(
                  `<div class="appendix-item"><p class="appendix-caption">${caption}</p></div>`,
                );
              }
            });

            sectionHtml += appendixParts.join('');
          }

          htmlParts.push(sectionHtml);
        }
      }
    }
  }

  // Appendix – Policy (from ReportData.policyFile)
  const policyFile = (report as any).policyFile as InvoiceFile | undefined;
  const attachPolicy = (report as any).attachPolicyAsAppendix;
  if (policyFile && (attachPolicy === undefined || attachPolicy)) {
    let policySection = '<h2>Appendix – Policy</h2>';
    const fileName = policyFile.name || 'Policy Document';
    const caption = escapeHtml(`Appendix – Policy – ${fileName}`);
    let mime = policyFile.type || 'application/octet-stream';
    if (!mime) {
      if (/\.(tif|tiff)$/i.test(fileName)) {
        mime = 'image/tiff';
      } else {
        mime = 'application/octet-stream';
      }
    }
    const src = `data:${mime};base64,${policyFile.data}`;
    const isImage = mime.startsWith("image/");
    const isPdf =
      mime === "application/pdf" ||
      mime === "application/x-pdf" ||
      mime === "application/octet-stream";

    if (isImage) {
      policySection +=
        `<div class="appendix-item"><img src="${src}" class="appendix-image" alt="${caption}" />` +
        `<div class="appendix-caption">${caption}</div></div>`;
    } else if (isPdf) {
      policySection +=
        `<div class="appendix-item"><object data="${src}" type="application/pdf" class="appendix-pdf">` +
        `<p class="appendix-caption">${caption}</p></object></div>`;
    } else {
      policySection +=
        `<div class="appendix-item"><p class="appendix-caption">${caption}</p></div>`;
    }

    htmlParts.push(policySection);
  }

  // Appendix – Lawyer Attachments
  const lawyerFiles = (report as any).lawyerAppendixFiles as InvoiceFile[] | undefined;
  if (Array.isArray(lawyerFiles) && lawyerFiles.length > 0) {
    let attachmentsSection = '<h2>Appendix – Lawyer Attachments</h2>';
    lawyerFiles.forEach((file, index) => {
      const fileName = file.name || `Attachment ${index + 1}`;
      const appendLabel = `Appendix ${index + 1} – ${fileName}`;
      const caption = escapeHtml(appendLabel);
      let mime = file.type || 'application/octet-stream';
      if (!mime) {
        if (/\.(tif|tiff)$/i.test(fileName)) {
          mime = 'image/tiff';
        } else {
          mime = 'application/octet-stream';
        }
      }
      const src = `data:${mime};base64,${file.data}`;
      const isImage = mime.startsWith("image/");
      const isPdf =
        mime === "application/pdf" ||
        mime === "application/x-pdf" ||
        mime === "application/octet-stream";

      if (isImage) {
        attachmentsSection +=
          `<div class="appendix-item"><img src="${src}" class="appendix-image" alt="${caption}" />` +
          `<div class="appendix-caption">${caption}</div></div>`;
      } else if (isPdf) {
        attachmentsSection +=
          `<div class="appendix-item"><object data="${src}" type="application/pdf" class="appendix-pdf">` +
          `<p class="appendix-caption">${caption}</p></object></div>`;
      } else {
        attachmentsSection +=
          `<div class="appendix-item"><p class="appendix-caption">${caption}</p></div>`;
      }
    });

    htmlParts.push(attachmentsSection);
  }

  return htmlParts.join("");
}

export function buildReportHtml(report: ReportData): string {
  // מחליפים את ה-link ל-CSS ב-inline style כדי ש-html2pdf יראה את ה-CSS
  let html = templateHtml.replace(
    '<link rel="stylesheet" href="template.css" />',
    `<style>${templateCss}</style>`
  );

  const dateToShow = report.reportDate
    ? formatDate(report.reportDate)
    : formatDate(new Date().toISOString());

  html = html
    .replace("{{LOGO_TOP_SRC}}", logoTop)
    .replace("{{LOGO_BOTTOM_SRC}}", logoBottom)
    .replace("{{SIGNATURE_SRC}}", signature)
    .replace("{{REPORT_DATE}}", escapeHtml(dateToShow))
    .replace("{{RECIPIENT_BLOCK_HTML}}", buildRecipientBlock(report))
    .replace("{{GREETING_LINE}}", `Dear ${escapeHtml(report.adjusterName || "")},`)
    .replace("{{RE_BLOCK_HTML}}", buildReBlock(report))
    .replace("{{PREVIOUS_REPORTS_HTML}}", buildPreviousReports(report))
    .replace("{{TIMELINE_SRC}}", "") // אם תרצה, תוסיף תמונת timeline בהמשך
    .replace("{{MAIN_SECTIONS_HTML}}", buildMainSections(report));

  return html;
}
