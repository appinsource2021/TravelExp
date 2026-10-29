import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Month, Position } from '../types/travel'

const MONTH_NAMES_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

export function buildPdfFilename(month: Month): string {
  return `Reisekosten_${month.personName.replace(' ', '_')}_${MONTH_NAMES_DE[month.month - 1]}_${month.year}.pdf`
}

function buildDoc(month: Month, positions: Position[], firma: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = 297
  const margin = 12

  const navy: [number, number, number] = [15, 23, 42]
  const blue: [number, number, number] = [30, 64, 175]
  const slate: [number, number, number] = [100, 116, 139]
  const light: [number, number, number] = [248, 250, 252]
  const green: [number, number, number] = [5, 150, 105]
  const yellow: [number, number, number] = [255, 251, 204]
  const border: [number, number, number] = [226, 232, 240]

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(month.year, month.month, 0).getDate()
  const periodStart = `01.${pad2(month.month)}.${month.year}`
  const periodEnd = `${lastDay}.${pad2(month.month)}.${month.year}`

  // ── Header bar ───────────────────────────────────────────────
  doc.setFillColor(...navy)
  doc.rect(0, 0, pageW, 22, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Reisekosten', margin, 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(148, 163, 184)
  doc.text(`${periodStart}  –  ${periodEnd}`, pageW - margin, 14, { align: 'right' })

  // ── Info boxes ───────────────────────────────────────────────
  const infoY = 26
  const infoH = 14

  const drawInfoBox = (x: number, w: number, label: string, value: string) => {
    doc.setFillColor(...light)
    doc.setDrawColor(...border)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, infoY, w, infoH, 2, 2, 'FD')
    doc.setTextColor(...slate)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(label, x + 3, infoY + 5)
    doc.setTextColor(...navy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(value, x + 3, infoY + 11)
  }

  drawInfoBox(margin, 84, 'NAME', month.personName)
  drawInfoBox(margin + 88, 84, 'FIRMA', firma || 'Norm Services GmbH')

  // Total box (blue, right)
  doc.setFillColor(...blue)
  doc.setDrawColor(...blue)
  doc.roundedRect(pageW - margin - 58, infoY, 58, infoH, 2, 2, 'F')
  doc.setTextColor(148, 163, 184)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('GESAMT', pageW - margin - 3, infoY + 5, { align: 'right' })
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(`${month.totalCost.toFixed(2).replace('.', ',')} €`, pageW - margin - 3, infoY + 12, { align: 'right' })

  // ── Table ────────────────────────────────────────────────────
  const head = [[
    'Datum', 'Start', 'Ende', 'Std.', 'Zielort', 'Reisezweck',
    'Verpfl.\nPauschal', 'Übern.\nPauschal', 'km', 'Km-\nPreis', 'Fahrk.\ntatsächl.', 'Gesamt',
  ]]

  const body = positions.map(p => [
    p.date,
    p.startTime,
    p.endTime,
    p.totalHours,
    p.destination,
    p.reisezweck,
    p.verpflegungPauschal > 0 ? `${p.verpflegungPauschal},00 €` : '—',
    p.uebernachtungPauschal > 0 ? `${p.uebernachtungPauschal},00 €` : '—',
    p.km.toString(),
    `${p.kmPrice.toFixed(2).replace('.', ',')} €`,
    `${p.fahrkostenTatsaechlich.toFixed(2).replace('.', ',')} €`,
    `${p.gesamt.toFixed(2).replace('.', ',')} €`,
  ])

  autoTable(doc, {
    startY: infoY + infoH + 4,
    head,
    body,
    styles: {
      fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      valign: 'middle',
      textColor: navy,
    },
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7.5,
      cellPadding: { top: 4, bottom: 4, left: 2, right: 2 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    tableLineColor: border,
    tableLineWidth: 0.2,
    columnStyles: {
      0: { cellWidth: 17 },
      1: { cellWidth: 13, halign: 'center' },
      2: { cellWidth: 13, halign: 'center' },
      3: { cellWidth: 13, halign: 'center' },
      4: { cellWidth: 65 },
      5: { cellWidth: 26 },
      6: { cellWidth: 19, halign: 'right' },
      7: { cellWidth: 19, halign: 'right' },
      8: { cellWidth: 11, halign: 'center' },
      9: { cellWidth: 15, halign: 'center' },
      10: { cellWidth: 21, halign: 'right' },
      11: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: navy },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const pos = positions[data.row.index]
        if (pos?.isOvernight) {
          data.cell.styles.fillColor = yellow
        }
      }
    },
  })

  const finalY: number = (doc as any).lastAutoTable.finalY

  // ── Total row ────────────────────────────────────────────────
  doc.setDrawColor(...border)
  doc.setLineWidth(0.4)
  doc.line(margin, finalY + 3, pageW - margin, finalY + 3)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...green)
  const totalLabel = 'Gesamt'
  const totalValue = `${month.totalCost.toFixed(2).replace('.', ',')} €`
  doc.text(totalLabel, pageW - margin - 35, finalY + 9)
  doc.text(totalValue, pageW - margin, finalY + 9, { align: 'right' })

  // ── Legend ───────────────────────────────────────────────────
  const legY = finalY + 14
  doc.setFillColor(...yellow)
  doc.setDrawColor(253, 224, 71)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, legY, 140, 9, 2, 2, 'FD')
  doc.setTextColor(...slate)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('mind. 14h → 14,00 €   ·   mind. 24h → 28,00 €   ·   Pkw 0,30 € / km', margin + 4, legY + 6)

  // ── Page footer ──────────────────────────────────────────────
  doc.setTextColor(...slate)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(`${MONTH_NAMES_DE[month.month - 1]} ${month.year}  ·  ${month.personName}`, margin, 206)
  doc.text('TravelExp Reisekosten Manager', pageW - margin, 206, { align: 'right' })

  return doc
}

export function exportToPdf(month: Month, positions: Position[], firma: string) {
  const doc = buildDoc(month, positions, firma)
  doc.save(buildPdfFilename(month))
}

export function exportToPdfBase64(month: Month, positions: Position[], firma: string): string {
  const doc = buildDoc(month, positions, firma)
  return doc.output('datauristring').split(',')[1]
}
