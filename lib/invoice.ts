import { merge } from "lodash";
import fs from "node:fs";
const PDFDocument = require("pdfkit");

export interface Invoice {
  defaultOptions: InvoiceDefaultOptions;
  options: InvoiceOptions;
  cursor: InvoiceCursor;
  document: typeof PDFDocument;

  subtotal: number;
  tax: number;
  total: number;
}

export interface InvoiceOptions {
  invoice: {
    number: string;
    date: string;
    name: string;
    message: string;
    terms: string;
    taxRate: number;
    createdAt?: string;
  };
  document: {
    size: "A4";
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    tableWidths: {
      service: number;
      amount: number;
      unit: number;
      price: number;
      total: number;
    };
  };
  sender: {
    id?: string;
    name: string;
    street: string;
    zip: string;
    city: string;
    email: string;
    taxId?: string;
    ustId?: string;
    bankName: string;
    iban: string;
    bic: string;
  };
  recipient: {
    id: string;
    company?: string;
    name: string;
    street: string;
    zip: string;
    city: string;
  };
  items: Array<{
    name: string;
    description: string;
    date?: string;
    amount: number;
    price: number;
  }>;
}

export interface InvoiceDefaultOptions {
  invoice: {
    name: string;
    date: string;
    message: string;
    terms: string;
    taxRate: number;
    createdAt: string;
  };
  document: {
    size: "A4";
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    tableWidths: {
      service: number;
      amount: number;
      unit: number;
      price: number;
      total: number;
    };
  };
}

export interface InvoiceCursor {
  x: number;
  y: number;
}

export interface InvoiceTextOptions {
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  color?: string;
  marginTop?: number;
  maxWidth?: number;
  skipDown?: boolean;
}

export class Invoice {
  constructor(options: InvoiceOptions) {
    this.defaultOptions = {
      invoice: {
        name: "Rechnung",
        date: (new Date()).toLocaleDateString("de"),
        taxRate: 19,
        message: "Sehr geehrter Kunde,\n\nvielen Dank für Ihren Auftrag. Anbei erhalten Sie die Rechnung für die erbrachten Leistungen.",
        terms: "Bitte überweisen Sie den vollständigen Rechnungsbetrag innerhalb von 14 Tagen auf die unten stehende Bankverbindung.\n\nVielen Dank für Ihr Vertrauen!",
        createdAt: (new Date()).toISOString(),
      },
      document: {
        size: "A4",
        marginTop: 40,
        marginBottom: 40,
        marginLeft: 50,
        marginRight: 50,
        tableWidths: {
          service: .5,
          amount: .1,
          unit: .1,
          price: .15,
          total: .15,
        }
      }
    };

    if (!options.invoice.number) throw new Error("Invoice number is required.");
    this.options = merge(this.defaultOptions, options);

    this.cursor = { x: 0, y: 0 };

    this.document = new PDFDocument({
      size: this.options.document.size,
      margins: {
        top: this.options.document.marginTop,
        bottom: this.options.document.marginBottom,
        left: this.options.document.marginLeft,
        right: this.options.document.marginRight
      },
    });

    this.subtotal = this.options.items.reduce((acc, item) => acc + (item.price * item.amount), 0)
    this.tax = this.subtotal * this.options.invoice.taxRate / 100 || 0
    this.total = this.subtotal + this.tax
    if (typeof this.subtotal !== "number" || typeof this.tax !== "number" || typeof this.total !== "number") {
      throw new Error("[FEHLER] Ungültiger Rechnungsbetrag\nBitte überprüfen Sie die Preise der angegebenen Leistungen.")
    }
  }

  /**
   * Moves the internal cursor
   *
   * @private
   * @param  {string} axis
   * @param  {number} value
   * @return void
   */
  setCursor(axis: "x" | "y", value: number = 0) {
    this.cursor[axis] = value;
  }

  /**
   * Resets the internal cursors position
   *
   * @private
   * @param  {string} axis
   * @return void
   */
  resetCursor(axis: "x" | "y" | null) {
    if (axis) {
      this.cursor[axis] = axis === "x" ? this.options.document.marginLeft : this.options.document.marginTop;
    } else {
      this.cursor = { x: this.options.document.marginLeft, y: this.options.document.marginTop };
    }
  }

  /**
   * Add new page
   *
   * @private
   * @return void
   */
  addPage() {
    this.document.addPage()
    this.setCursor("y", this.options.document.marginTop)
    this.resetCursor("x")
  }

  /**
   * Adds text on the invoice with specified options
   *
   * @private
   * @param  {string} text
   * @param  {object} options
   * @return void
   */
  setText(text: string, options: InvoiceTextOptions = {}) {
    let _fontWeight = options.fontWeight || "normal";
    let _font = _fontWeight === "bold" ? "Helvetica-Bold" : "Helvetica"
    let _fontSize = options.fontSize || 12;
    let _textAlign = options.align || "left";
    let _color = options.color || "#000";
    let _marginTop = options.marginTop || 0;
    let _maxWidth = options.maxWidth || this.document.page.width - (this.options.document.marginLeft + this.options.document.marginRight);

    // add new page if text is too long
    const heightOfString = this.document.heightOfString(text, { width: _maxWidth })
    if (this.cursor.y > this.document.page.height - (_marginTop + heightOfString + this.options.document.marginBottom)) {
      this.addPage()
    }

    this.cursor.y += _marginTop;
    this.document.fillColor(_color);
    this.document.fillColor(_color);
    this.document.fontSize(_fontSize);
    this.document.font(_font)

    this.document.text(
      text,
      this.cursor.x,
      this.cursor.y,
      {
        align : _textAlign,
        width : _maxWidth
      }
    );

    if (options.skipDown) {
      this.cursor.y -= _marginTop;
      this.document.y = this.cursor.y
    } else {
      this.cursor.y = this.document.y;
    }
  }

  /**
   * Generates a line separator
   *
   * @private
   * @return void
   */
  generateLine(options: { marginTop: number } = { marginTop: 12 }) {
    this.cursor.y += options.marginTop
  
    this.document
      .strokeColor("#F0F0F0")
      .lineWidth(1)
      .moveTo(
        this.options.document.marginRight,
        this.cursor.y
      )
      .lineTo(
        this.document.page.width - this.options.document.marginRight,
        this.cursor.y
      )
      .stroke();
  }

  /**
   * Creates the invoice document and saves it to the given path
   *
   * @public
   * @param string
   * @return Promise
   */
  create(path?: string) {
    this.generateHeader();
    this.generateTable();
    this.generateFooter();

    if (!path) path = `${this.options.invoice.number}.pdf`

    const _stream = fs.createWriteStream(path);
    this.document.pipe(_stream);
    this.document.end();

    return new Promise<void>((resolve, reject) => {
      this.document.on("end", async () => {
        return resolve();
      });

      this.document.on("error", () => {
        console.error("Error while creating invoice.")
        return reject();
      });
    });
  }

  generateHeader() {
    this.setCursor("x", this.options.document?.marginLeft || this.defaultOptions.document.marginLeft);
    this.setCursor("y", this.options.document?.marginTop || this.defaultOptions.document.marginTop);

    const _invoice = this.options.invoice
    const _sender = this.options.sender
    const _recipient = this.options.recipient
    const _items = this.options.items
    const _maxWidth = this.document.page.width - (this.options.document.marginLeft + this.options.document.marginRight);
    const _recipientWidth = _maxWidth * .5

    // sender details
    this.setText(_sender.name, { align: "right", fontWeight: "bold" })
    this.setText(_sender.street, { align: "right", marginTop: 2 })
    this.setText(`${_sender.zip} ${_sender.city}`, { align: "right", marginTop: 2 })
    this.setText(_sender.email, { align: "right", marginTop: 2 })
    this.cursor.y += 40

    // recipient details
    const _yBeforeDetails = this.cursor.y
    if (_recipient.company) this.setText(_recipient.company, { fontWeight: "bold", maxWidth: _recipientWidth })
    if (_recipient.name) this.setText(_recipient.name, { fontWeight: _recipient.company ? "normal" : "bold", maxWidth: _recipientWidth })
    this.setText(_recipient.street, { marginTop: 2, maxWidth: _recipientWidth })
    this.setText(`${_recipient.zip} ${_recipient.city}`, { marginTop: 2, maxWidth: _recipientWidth })
    let _yAfterDetails = this.cursor.y

    // invoice details
    this.setCursor("y", _yBeforeDetails)

    if (_recipient.id) {
      this.setCursor("x", _recipientWidth + this.options.document.marginLeft + 20)
      this.setText("Kundennr.:", { maxWidth: 110, align: "right", skipDown: true })
      this.resetCursor("x")
      this.setText(String(_recipient.id), { fontWeight: "bold", align: "right" })
    }

    this.setCursor("x", _recipientWidth + this.options.document.marginLeft + 20)
    this.setText("Rechnungsnr.:", { marginTop: 2, maxWidth: 110, align: "right", skipDown: true })
    this.resetCursor("x")
    this.setText(_invoice.number, { marginTop: 2, fontWeight: "bold", align: "right" })

    this.setCursor("x", _recipientWidth + this.options.document.marginLeft + 20)
    this.setText("Rechnungsdatum:", { marginTop: 2, maxWidth: 110, align: "right", skipDown: true })
    this.resetCursor("x")
    this.setText(_invoice.date, { marginTop: 2, fontWeight: "bold", align: "right" })

    if (_items.length > 1) {
      let _dates = _items.map(i => i.date)
      _dates = _dates.filter(d => d !== undefined)
      _dates = _dates.sort()
      if (_dates.length > 1) {
        const firstDateString = `${_dates[0]?.split(".")[0]}.${_dates[0]?.split(".")[1]}.`
        const deliveryPeriodString = `${firstDateString}-${_dates[_dates.length - 1]}`
        this.setCursor("x", _recipientWidth + this.options.document.marginLeft + 20)
        this.setText("Lieferzeitraum:", { marginTop: 2, maxWidth: 110, align: "right", skipDown: true })
        this.resetCursor("x")
        this.setText(deliveryPeriodString, { marginTop: 2, fontWeight: "bold", align: "right" })
      }
    } else {
      if (_items.length && _items[0].date) {
        this.setCursor("x", _recipientWidth + this.options.document.marginLeft + 20)
        this.setText("Lieferdatum:", { marginTop: 2, maxWidth: 110, align: "right", skipDown: true })
        this.resetCursor("x")
        this.setText(_items[0].date, { marginTop: 2, fontWeight: "bold", align: "right" })
      }
    }

    if (this.document.y > _yAfterDetails) _yAfterDetails = this.document.y

    this.resetCursor("x")
    this.setCursor("y", _yAfterDetails)
    this.setText(_invoice.name, { fontSize: 18, fontWeight: "bold", marginTop: 40 })
    this.setText(_invoice.message, { marginTop: 20 })
  }

  generateTable() {
    this.cursor.y += 40

    this.generateTableHeader()
    this.options.items.forEach(item => this.generateTableItemRow(item))
    this.generateTableTotalRows()
  }

  generateTableHeader() {
    const _maxWidth = this.document.page.width - (this.options.document.marginLeft + this.options.document.marginRight);
    const _widths = {
      service: _maxWidth * this.options.document.tableWidths.service,
      amount: _maxWidth * this.options.document.tableWidths.amount,
      unit: _maxWidth * this.options.document.tableWidths.unit,
      price: _maxWidth * this.options.document.tableWidths.price,
      total: _maxWidth * this.options.document.tableWidths.total
    }
    const _offsets = {
      amount: this.options.document.marginLeft + _widths.service,
      unit: this.options.document.marginLeft + _widths.service + _widths.amount,
      price: this.options.document.marginLeft + _widths.service + _widths.amount + _widths.unit,
      total: this.options.document.marginLeft + _widths.service + _widths.amount + _widths.unit + _widths.price
    }

    // service
    this.setText("Leistung", { maxWidth: _widths.service, skipDown: true, fontWeight: "bold", fontSize: 12 })

    // amount
    this.setCursor("x", _offsets.amount)
    this.setText("Anzahl", { maxWidth: _widths.amount, skipDown: true, align: "center", fontWeight: "bold", fontSize: 12 })

    // unit
    this.setCursor("x", _offsets.unit)
    this.setText("Einheit", { maxWidth: _widths.unit, skipDown: true, align: "center", fontWeight: "bold", fontSize: 12 })

    // price
    this.setCursor("x", _offsets.price)
    this.setText("Preis", { maxWidth: _widths.price, skipDown: true, align: "right", fontWeight: "bold", fontSize: 12 })

    //total
    this.setCursor("x", _offsets.total)
    this.setText("Gesamt", { maxWidth: _widths.total, fontWeight: "bold", fontSize: 12, align: "right" })

    this.generateLine()
  }

  generateTableItemRow(item: { name: string; description: string; amount: number; unit: string; price: number; }) {
    // add new page if item row and total rows will not fit on the current page
    // if taxRate === 0, only one total row will be displayed (total)
    const _totalRowsHeight = this.options.invoice.taxRate > 0 ? 156 : 68
    if (this.cursor.y > this.document.page.height - (_totalRowsHeight + this.options.document.marginBottom)) {
      this.addPage()
      this.generateTableHeader()
    }

    const _maxWidth = this.document.page.width - (this.options.document.marginLeft + this.options.document.marginRight);
    const _widths = {
      service: _maxWidth * this.options.document.tableWidths.service,
      amount: _maxWidth * this.options.document.tableWidths.amount,
      unit: _maxWidth * this.options.document.tableWidths.amount,
      price: _maxWidth * this.options.document.tableWidths.price,
      total: _maxWidth * this.options.document.tableWidths.total
    }
    const _offsets = {
      amount: this.options.document.marginLeft + _widths.service,
      unit: this.options.document.marginLeft + _widths.service + _widths.amount,
      price: this.options.document.marginLeft + _widths.service + _widths.amount + _widths.unit,
      total: this.options.document.marginLeft + _widths.service + _widths.amount + _widths.unit + _widths.price
    }

    const _y = this.cursor.y
    const _price = item.price.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
    const _total = (item.price * item.amount).toLocaleString("de-DE", { style: "currency", currency: "EUR" })

    // item name
    this.resetCursor("x")
    this.setText(item.name, { maxWidth: _widths.service, fontWeight: "bold", marginTop: 12 })
    this.setText(item.description, { maxWidth: _widths.service, fontSize: 10, marginTop: 2 })
    
    // amount
    this.setCursor("y", _y)
    this.setCursor("x", _offsets.amount)
    this.setText(String(item.amount).replace(".", ","), { maxWidth: _widths.amount, align: "center", fontWeight: "bold", marginTop: 12, skipDown: true })
    
    // unit
    this.setCursor("y", _y)
    this.setCursor("x", _offsets.unit)
    this.setText(item.unit, { maxWidth: _widths.unit, align: "center", fontWeight: "bold", marginTop: 12, skipDown: true })
    
    // price
    this.setCursor("y", _y)
    this.setCursor("x", _offsets.price)
    this.setText(_price, { maxWidth: _widths.price, align: "right", fontWeight: "bold", marginTop: 12, skipDown: true })
    
    // subtotal
    this.setCursor("y", _y)
    this.setCursor("x", _offsets.total)
    this.setText(_total, { maxWidth: _widths.total, align: "right", fontWeight: "bold", marginTop: 12 })
    
    this.cursor.y += 12
    this.generateLine()
  }

  generateTableTotalRows() {
    const _maxWidth = this.document.page.width - (this.options.document.marginLeft + this.options.document.marginRight);
    const _widths = {
      service: _maxWidth * this.options.document.tableWidths.service,
      amount: _maxWidth * this.options.document.tableWidths.amount,
      unit: _maxWidth * this.options.document.tableWidths.unit,
      price: _maxWidth * this.options.document.tableWidths.price,
      total: _maxWidth * this.options.document.tableWidths.total
    }
    const _offset = this.options.document.marginLeft + _widths.service + _widths.amount + _widths.unit + _widths.price
    
    if (this.options.invoice.taxRate > 0) {
      this.setCursor("x", this.options.document.marginLeft)
      this.setText("Zwischensumme (Netto)", { maxWidth: _widths.service + _widths.amount + _widths.unit + _widths.price, fontWeight: "bold", align: "right", marginTop: 16, skipDown: true })
      this.setCursor("x", _offset)
      this.setText(this.subtotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" }), { maxWidth: _widths.total, align: "right", fontWeight: "bold", marginTop: 16 })
      this.generateLine()
    
      this.setCursor("x", this.options.document.marginLeft)
      this.setText(`Umsatzsteuer (${this.options.invoice.taxRate}%)`, { maxWidth: _widths.service + _widths.amount + _widths.unit + _widths.price, fontWeight: "bold", align: "right", marginTop: 16, skipDown: true })
      this.setCursor("x", _offset)
      this.setText(this.tax.toLocaleString("de-DE", { style: "currency", currency: "EUR" }), { maxWidth: _widths.total, align: "right", fontWeight: "bold", marginTop: 16 })
      this.generateLine()
    }
    
    this.setCursor("x", this.options.document.marginLeft)
    this.setText("Gesamt", { maxWidth: _widths.service + _widths.amount + _widths.unit + _widths.price, fontWeight: "bold", align: "right", marginTop: 16, skipDown: true })
    this.setCursor("x", _offset)
    this.setText(this.total.toLocaleString("de-DE", { style: "currency", currency: "EUR" }), { maxWidth: _widths.total, align: "right", fontWeight: "bold", marginTop: 16 })
    this.generateLine()
  }

  generateFooter() {
    this.resetCursor("x")
    this.setText(this.options.invoice.terms, { marginTop: 40 })

    this.setText(this.options.sender.name, { marginTop: 40, fontWeight: "bold" })

    if (this.options.sender.taxId) {
      this.resetCursor("x")
      this.setText("St.Nr.: ", { marginTop: 4, skipDown: true })
      this.cursor.x += 40
      this.setText(this.options.sender.taxId, { marginTop: 4 })
    }

    if (this.options.sender.ustId) {
      this.resetCursor("x")
      this.setText("USt.Id.: ", { marginTop: 4, skipDown: true })
      this.cursor.x += 40
      this.setText(this.options.sender.ustId, { marginTop: 4 })
    }

    this.resetCursor("x")
    this.setText("Bank: ", { marginTop: 8, skipDown: true })
    this.cursor.x += 40
    this.setText(this.options.sender.bankName, { marginTop: 8 })

    this.resetCursor("x")
    this.setText("IBAN: ", { marginTop: 4, skipDown: true })
    this.cursor.x += 40
    this.setText(this.options.sender.iban, { marginTop: 4 })

    this.resetCursor("x")
    this.setText("BIC: ", { marginTop: 4, skipDown: true })
    this.cursor.x += 40
    this.setText(this.options.sender.bic, { marginTop: 4 })
  }
}

export default Invoice;
