/**
 * CSV builder. Escapes quotes and neutralises spreadsheet formula injection
 * (cells starting with = + - @ tab or CR are prefixed with an apostrophe).
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))];
  // BOM so Excel opens UTF-8 (₱, ñ) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
