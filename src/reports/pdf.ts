import PDFDocument from "pdfkit";

// Pequeña capa sobre PDFKit con los bloques que usan los informes:
// encabezado, títulos de sección, pares etiqueta-valor, tablas y un gráfico de línea.

export const COLORS = {
  brand: "#2f7d6d",
  brandLight: "#e3f1ec",
  ink: "#22302c",
  muted: "#6b7a75",
  line: "#d9e3df",
  warn: "#c8553d",
};

const MARGIN = 48;

// La fuente estándar del PDF (WinAnsi) no trae algunos signos matemáticos; se reemplazan por equivalentes.
export function pdfText(value: unknown): string {
  return String(value).replace(/−/g, "-").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/⅓/g, "1/3");
}

export interface Header {
  title: string;
  subtitle?: string;
  nutritionist: string;
  license?: string | null;
  clinic?: string | null;
  contact?: string | null;
  draft?: boolean;
  timezone?: string;
}

export class Pdf {
  readonly doc: PDFKit.PDFDocument;
  private readonly chunks: Buffer[] = [];
  private readonly done: Promise<Buffer>;
  private readonly draft: boolean;
  private readonly timezone: string;

  constructor(header: Header) {
    this.doc = new PDFDocument({ size: "LETTER", margin: MARGIN, bufferPages: true, info: { Title: header.title } });
    this.doc.on("data", (c: Buffer) => this.chunks.push(c));
    this.done = new Promise((resolve) => this.doc.on("end", () => resolve(Buffer.concat(this.chunks))));
    this.draft = !!header.draft;
    this.timezone = header.timezone ?? "America/Panama";
    this.header(header);
  }

  get width() {
    return this.doc.page.width - MARGIN * 2;
  }

  private header(h: Header) {
    const { doc } = this;
    doc.rect(0, 0, doc.page.width, 6).fill(COLORS.brand);
    doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(20).text("NutriPro", MARGIN, 26);
    const right = [h.clinic, h.nutritionist, h.license ? `Reg. ${h.license}` : null, h.contact].filter(Boolean).join("\n");
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(right, MARGIN, 28, { width: this.width, align: "right" });
    doc.moveDown(1.6);
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(16).text(h.title, MARGIN);
    if (h.subtitle) doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(h.subtitle);
    doc.moveDown(0.6);
    this.rule();
  }

  rule() {
    const y = this.doc.y;
    this.doc.moveTo(MARGIN, y).lineTo(MARGIN + this.width, y).lineWidth(0.7).strokeColor(COLORS.line).stroke();
    this.doc.moveDown(0.6);
  }

  ensureSpace(height: number) {
    if (this.doc.y + height > this.doc.page.height - MARGIN - 20) this.doc.addPage();
  }

  section(title: string) {
    this.ensureSpace(60);
    this.doc.moveDown(0.5);
    this.doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(12).text(title, MARGIN);
    this.doc.moveDown(0.3);
  }

  paragraph(text: string | null | undefined, options: { muted?: boolean; size?: number } = {}) {
    if (!text) return;
    this.doc
      .fillColor(options.muted ? COLORS.muted : COLORS.ink)
      .font("Helvetica")
      .fontSize(options.size ?? 10)
      .text(pdfText(text), MARGIN, undefined, { width: this.width });
    this.doc.moveDown(0.3);
  }

  bullets(items: string[]) {
    for (const item of items) {
      this.ensureSpace(16);
      this.doc.fillColor(COLORS.ink).font("Helvetica").fontSize(10).text(`•  ${pdfText(item)}`, MARGIN + 6, undefined, { width: this.width - 6 });
    }
    this.doc.moveDown(0.3);
  }

  // Pares etiqueta-valor en columnas.
  fields(pairs: [string, string | number | null | undefined][], columns = 3) {
    const visible = pairs.filter(([, v]) => v !== null && v !== undefined && v !== "");
    const colWidth = this.width / columns;
    for (let i = 0; i < visible.length; i += columns) {
      this.ensureSpace(30);
      const y = this.doc.y;
      let maxY = y;
      visible.slice(i, i + columns).forEach(([label, value], j) => {
        const x = MARGIN + j * colWidth;
        this.doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(label.toUpperCase(), x, y, { width: colWidth - 8 });
        this.doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(10).text(pdfText(value), x, undefined, { width: colWidth - 8 });
        maxY = Math.max(maxY, this.doc.y);
      });
      this.doc.y = maxY + 6;
    }
    this.doc.x = MARGIN;
  }

  // Tabla simple. widths en fracciones del ancho total.
  table(headers: string[], rows: (string | number)[][], widths?: number[], options: { boldFirst?: boolean } = {}) {
    const w = widths ?? headers.map(() => 1 / headers.length);
    const cols = w.map((f) => f * this.width);
    const drawRow = (cells: (string | number)[], header: boolean) => {
      const heights = cells.map((c, i) =>
        this.doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(pdfText(c), { width: cols[i] - 8 }),
      );
      const h = Math.max(...heights) + 8;
      this.ensureSpace(h + 4);
      const y = this.doc.y;
      if (header) this.doc.rect(MARGIN, y, this.width, h).fill(COLORS.brandLight);
      let x = MARGIN;
      cells.forEach((c, i) => {
        const bold = header || (options.boldFirst && i === 0);
        this.doc
          .fillColor(header ? COLORS.brand : COLORS.ink)
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9)
          .text(pdfText(c), x + 4, y + 4, { width: cols[i] - 8 });
        x += cols[i];
      });
      this.doc.moveTo(MARGIN, y + h).lineTo(MARGIN + this.width, y + h).lineWidth(0.5).strokeColor(COLORS.line).stroke();
      this.doc.y = y + h;
    };
    drawRow(headers, true);
    rows.forEach((r) => drawRow(r, false));
    this.doc.x = MARGIN;
    this.doc.moveDown(0.6);
  }

  // Gráfico de línea sencillo (p. ej. evolución del peso).
  lineChart(points: { label: string; value: number }[], unit: string, height = 150) {
    if (points.length < 2) return;
    this.ensureSpace(height + 30);
    const { doc } = this;
    const x0 = MARGIN + 30;
    const y0 = doc.y + 8;
    const w = this.width - 40;
    const values = points.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (max - min < 1) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.15;
    min -= pad;
    max += pad;
    const px = (i: number) => x0 + (i / (points.length - 1)) * w;
    const py = (v: number) => y0 + height - ((v - min) / (max - min)) * height;

    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4;
      const y = py(v);
      doc.moveTo(x0, y).lineTo(x0 + w, y).lineWidth(0.4).strokeColor(COLORS.line).stroke();
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7).text(v.toFixed(1), MARGIN, y - 3, { width: 26, align: "right" });
    }
    doc.moveTo(px(0), py(values[0]));
    values.forEach((v, i) => i > 0 && doc.lineTo(px(i), py(v)));
    doc.lineWidth(1.6).strokeColor(COLORS.brand).stroke();
    points.forEach((p, i) => {
      doc.circle(px(i), py(p.value), 2.6).fill(COLORS.brand);
      doc.fillColor(COLORS.muted).fontSize(7).text(p.label, px(i) - 25, y0 + height + 4, { width: 50, align: "center" });
    });
    doc.fillColor(COLORS.muted).fontSize(7).text(unit, MARGIN, y0 - 10);
    doc.y = y0 + height + 20;
    doc.x = MARGIN;
  }

  async finish(): Promise<Buffer> {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      if (this.draft) {
        doc.save();
        doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
        doc.fillColor(COLORS.warn).opacity(0.08).font("Helvetica-Bold").fontSize(90);
        doc.text("BORRADOR", 0, doc.page.height / 2 - 45, { width: doc.page.width, align: "center", lineBreak: false });
        doc.restore();
        doc.opacity(1);
      }
      const bottom = doc.page.height - MARGIN + 16;
      // Sin margen inferior temporalmente para que el pie no cree otra página.
      const margin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(
          `Generado con NutriPro el ${new Date().toLocaleDateString("es-PA", { timeZone: this.timezone })} · Página ${i + 1} de ${range.count}`,
          MARGIN,
          bottom,
          { width: this.width, align: "center", lineBreak: false },
        );
      doc.page.margins.bottom = margin;
    }
    doc.end();
    return this.done;
  }
}
