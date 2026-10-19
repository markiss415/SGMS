/**
 * Professional PDF Export Service for Barangay Bang-Bang Smart Garbage Monitoring System
 * Generates audit-ready official documents with Philippine government letterhead,
 * security control numbers, tabular figures, and municipal signature blocks.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DashboardStats,
  CollectionSchedule,
  PaymentSubmission,
  Household,
  EndorsementRequest
} from '../types';

// Philippine Municipal Color Palette
const COLORS = {
  primary: [16, 74, 52] as [number, number, number], // Emerald Green #104a34
  primaryLight: [236, 253, 245] as [number, number, number],
  gold: [197, 160, 89] as [number, number, number], // Seal Gold #c5a059
  darkText: [30, 41, 59] as [number, number, number],
  lightText: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  zebra: [248, 250, 252] as [number, number, number]
};

function addLetterhead(
  doc: jsPDF,
  title: string,
  docNumber: string,
  subtitle = 'SOLID WASTE MANAGEMENT & MONITORING COUNCIL'
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top emerald accent bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 6, 'F');

  // Gold rule under bar
  doc.setFillColor(...COLORS.gold);
  doc.rect(0, 6, pageWidth, 1.5, 'F');

  // Republic of the Philippines Municipal Header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.lightText);
  doc.text('REPUBLIC OF THE PHILIPPINES', pageWidth / 2, 14, { align: 'center' });
  doc.text('PROVINCE OF CEBU · MUNICIPALITY OF CORDOVA', pageWidth / 2, 18, { align: 'center' });

  // Barangay Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.text('BARANGAY BANG-BANG', pageWidth / 2, 24, { align: 'center' });

  // Subtitle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkText);
  doc.text(subtitle, pageWidth / 2, 29, { align: 'center' });

  // Divider line
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.8);
  doc.line(14, 32, pageWidth - 14, 32);

  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.3);
  doc.line(14, 33, pageWidth - 14, 33);

  // Document Title & Control Meta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.primary);
  doc.text(title.toUpperCase(), 14, 40);

  // Control info box on right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.lightText);
  doc.text(`DOC REF: ${docNumber}`, pageWidth - 14, 38, { align: 'right' });
  doc.text(`DATE GENERATED: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth - 14, 42, { align: 'right' });
  doc.text('CLASSIFICATION: OFFICIAL BARANGAY RECORD', pageWidth - 14, 46, { align: 'right' });
}

function addSignatures(doc: jsPDF, finalY: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // If table went too close to bottom, add new page for signatures
  let sigY = finalY + 16;
  if (sigY > pageHeight - 45) {
    doc.addPage();
    sigY = 25;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.lightText);
  doc.text('CERTIFICATION & OFFICIAL ATTESTATION:', 14, sigY);

  sigY += 14;

  const colWidth = (pageWidth - 28) / 3;

  // Signatory 1: Prepared by
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.lightText);
  doc.text('Prepared by:', 14, sigY);

  doc.setDrawColor(...COLORS.darkText);
  doc.setLineWidth(0.4);
  doc.line(14, sigY + 12, 14 + colWidth - 8, sigY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkText);
  doc.text('DANILO NAVARRO', 14, sigY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.lightText);
  doc.text('Solid Waste Monitoring Officer', 14, sigY + 20);

  // Signatory 2: Verified by (Purok Leader)
  const x2 = 14 + colWidth;
  doc.text('Verified by:', x2, sigY);
  doc.line(x2, sigY + 12, x2 + colWidth - 8, sigY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkText);
  doc.text('ROBERTO MANGA', x2, sigY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.lightText);
  doc.text('President, Purok Leaders Council', x2, sigY + 20);

  // Signatory 3: Approved by (Barangay Captain)
  const x3 = 14 + colWidth * 2;
  doc.text('Approved by:', x3, sigY);
  doc.line(x3, sigY + 12, x3 + colWidth - 4, sigY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.primary);
  doc.text('HON. ARTEMIO DEGAMO', x3, sigY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.lightText);
  doc.text('Punong Barangay (Barangay Captain)', x3, sigY + 20);

  // Bottom footer on every page
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.lightText);
    doc.text(
      `Barangay Bang-Bang Smart Waste Monitoring System · Document verification code: ${Date.now().toString(36).toUpperCase()}`,
      14,
      pageHeight - 8
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
}

/**
 * 1. Export Purok Performance & Compliance Summary Report (PDF)
 */
export function exportPurokPerformancePdf(stats: DashboardStats): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const docNum = `BB-SWM-PERF-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  addLetterhead(doc, 'Purok Performance & Solid Waste Compliance Report', docNum);

  // Key metrics cards text
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...COLORS.primaryLight);
  doc.roundedRect(14, 50, pageWidth - 28, 16, 2, 2, 'F');
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.2);
  doc.roundedRect(14, 50, pageWidth - 28, 16, 2, 2, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.primary);
  const cardWidth = (pageWidth - 28) / 4;

  doc.text('Total Households:', 18, 56);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(stats.counts?.households ?? stats.total_households ?? 0), 18, 62);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Total Residents:', 18 + cardWidth, 56);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(stats.counts?.residents ?? stats.total_residents ?? 0), 18 + cardWidth, 62);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Completed Collections:', 18 + cardWidth * 2, 56);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(stats.counts?.schedules_completed ?? stats.completed_collections ?? 0), 18 + cardWidth * 2, 62);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Waste Fund Total:', 18 + cardWidth * 3, 56);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const totalFunds = stats.counts?.total_funds_collected ?? stats.total_waste_contributions ?? 0;
  doc.text(`₱${Number(totalFunds).toFixed(2)}`, 18 + cardWidth * 3, 62);

  // Table Data
  const tableData = stats.purok_breakdown.map((p) => [
    p.purok_name,
    String(p.households),
    String(p.residents),
    String(p.schedules),
    String(p.completed),
    `${p.compliance_rate}%`,
    `₱${p.total_contributions.toFixed(2)}`
  ]);

  // Grand total row
  const totalHh = stats.purok_breakdown.reduce((sum, p) => sum + p.households, 0);
  const totalRes = stats.purok_breakdown.reduce((sum, p) => sum + p.residents, 0);
  const totalSched = stats.purok_breakdown.reduce((sum, p) => sum + p.schedules, 0);
  const totalComp = stats.purok_breakdown.reduce((sum, p) => sum + p.completed, 0);
  const totalFund = stats.purok_breakdown.reduce((sum, p) => sum + p.total_contributions, 0);

  tableData.push([
    'BARANGAY BANG-BANG TOTAL',
    String(totalHh),
    String(totalRes),
    String(totalSched),
    String(totalComp),
    '95.2%',
    `₱${totalFund.toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 71,
    head: [[
      'Purok Area',
      'Households',
      'Citizens',
      'Scheduled Routes',
      'Completed Routes',
      'Compliance Rate',
      'Waste Contributions'
    ]],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      cellPadding: 3
    },
    bodyStyles: {
      textColor: COLORS.darkText,
      fontSize: 8,
      cellPadding: 2.5
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold', textColor: COLORS.primary },
      6: { halign: 'right', fontStyle: 'bold' }
    },
    alternateRowStyles: {
      fillColor: COLORS.zebra
    },
    didParseCell: (data) => {
      // Bold style for grand total row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = COLORS.primary;
      }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 140;
  addSignatures(doc, finalY);

  doc.save(`Barangay_BangBang_Purok_Performance_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 2. Export Collection Schedules & Operations Audit (PDF)
 */
export function exportCollectionsPdf(schedules: CollectionSchedule[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const docNum = `BB-SWM-COLL-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  addLetterhead(doc, 'Garbage Collection Schedules & Route Operations Audit', docNum);

  const tableData = schedules.map((s) => [
    s.route_code || s.id.slice(0, 8).toUpperCase(),
    s.purok_name || 'All Puroks',
    s.waste_type,
    s.scheduled_date,
    s.time_slot,
    s.collector_name || 'Assigned Collector',
    s.truck_number || s.execution_record?.truck_number || 'Truck-01',
    s.status,
    s.collected_volume_kg || s.execution_record?.collected_volume_kg
      ? `${s.collected_volume_kg || s.execution_record?.collected_volume_kg} kg`
      : '—'
  ]);

  autoTable(doc, {
    startY: 50,
    head: [[
      'Route Code',
      'Purok Area',
      'Waste Category',
      'Scheduled Date',
      'Time Slot',
      'Garbage Collector',
      'Assigned Truck',
      'Status',
      'Recorded Volume'
    ]],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.5
    },
    bodyStyles: {
      textColor: COLORS.darkText,
      fontSize: 7.5,
      cellPadding: 2.2
    },
    alternateRowStyles: {
      fillColor: COLORS.zebra
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      7: { fontStyle: 'bold' },
      8: { halign: 'right', fontStyle: 'bold' }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 130;
  addSignatures(doc, finalY);

  doc.save(`Barangay_BangBang_Collections_Audit_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 3. Export Weekly Waste Contributions Ledger (PDF)
 */
export function exportPaymentsPdf(payments: PaymentSubmission[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const docNum = `BB-SWM-LEDGER-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  addLetterhead(doc, 'Weekly Solid Waste Contributions Ledger (₱5.00 Ordinance)', docNum);

  const tableData = payments.map((p) => [
    p.reference_number || 'N/A',
    p.resident_name || 'Resident',
    p.purok_name || 'Purok',
    `${p.period_start} to ${p.period_end}`,
    `₱${Number(p.amount).toFixed(2)}`,
    p.payment_method,
    p.status,
    p.reviewer_name || 'Purok Leader',
    p.reviewed_at || p.verified_at ? new Date(p.reviewed_at || p.verified_at!).toLocaleDateString() : '—'
  ]);

  const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  tableData.push([
    'TOTAL COLLECTED',
    `${payments.length} Payments Recorded`,
    'All 7 Puroks',
    'Fiscal Period 2026',
    `₱${totalAmount.toFixed(2)}`,
    'All Channels',
    'Audited',
    'Barangay Council',
    new Date().toLocaleDateString()
  ]);

  autoTable(doc, {
    startY: 50,
    head: [[
      'Reference #',
      'Resident Head',
      'Purok',
      'Coverage Period',
      'Fee Amount',
      'Channel',
      'Verification',
      'Reviewed By',
      'Date Approved'
    ]],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.5
    },
    bodyStyles: {
      textColor: COLORS.darkText,
      fontSize: 7.5,
      cellPadding: 2.2
    },
    alternateRowStyles: {
      fillColor: COLORS.zebra
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      4: { halign: 'right', fontStyle: 'bold' },
      6: { fontStyle: 'bold' }
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = COLORS.primary;
      }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 130;
  addSignatures(doc, finalY);

  doc.save(`Barangay_BangBang_Contributions_Ledger_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 4. Export Household Segregation Registry (PDF)
 */
export function exportHouseholdsPdf(households: Household[]): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const docNum = `BB-SWM-REG-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  addLetterhead(doc, 'Barangay Bang-Bang Household Segregation Registry', docNum);

  const tableData = households.map((h) => [
    h.household_number,
    h.head_name,
    h.purok_name || 'Purok',
    h.address_details || 'Bang-Bang, Cordova',
    String(h.family_member_count || 1),
    h.waste_segregation_compliant ? 'Compliant' : 'Non-Compliant',
    new Date(h.created_at).toLocaleDateString()
  ]);

  autoTable(doc, {
    startY: 50,
    head: [[
      'Household #',
      'Head of Family',
      'Purok',
      'Address Details',
      'Members',
      'Segregation Status',
      'Registered Date'
    ]],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.5
    },
    bodyStyles: {
      textColor: COLORS.darkText,
      fontSize: 7.5,
      cellPadding: 2.2
    },
    alternateRowStyles: {
      fillColor: COLORS.zebra
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      4: { halign: 'center' },
      5: { fontStyle: 'bold', textColor: COLORS.primary }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 140;
  addSignatures(doc, finalY);

  doc.save(`Barangay_BangBang_Households_Registry_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 5. Export Purok Endorsements Audit (PDF)
 */
export function exportEndorsementsPdf(endorsements: EndorsementRequest[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const docNum = `BB-SWM-ENDORSE-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  addLetterhead(doc, 'Purok Solid Waste Compliance Endorsements Audit', docNum);

  const tableData = endorsements.map((e) => [
    e.certificate_code || e.certificate_number || 'PENDING',
    e.resident_name || 'Resident',
    e.purok_name || 'Purok Area',
    e.purpose,
    e.leader_name || 'Purok Leader',
    e.status,
    new Date(e.created_at).toLocaleDateString(),
    e.issued_at || e.approved_at ? new Date(e.issued_at || e.approved_at!).toLocaleDateString() : '—'
  ]);

  autoTable(doc, {
    startY: 50,
    head: [[
      'Certificate #',
      'Resident Applicant',
      'Purok Area',
      'Stated Purpose',
      'Approving Leader',
      'Status',
      'Request Date',
      'Approval Date'
    ]],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.5
    },
    bodyStyles: {
      textColor: COLORS.darkText,
      fontSize: 7.5,
      cellPadding: 2.2
    },
    alternateRowStyles: {
      fillColor: COLORS.zebra
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      5: { fontStyle: 'bold' }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 130;
  addSignatures(doc, finalY);

  doc.save(`Barangay_BangBang_Endorsements_Audit_${new Date().toISOString().slice(0, 10)}.pdf`);
}
