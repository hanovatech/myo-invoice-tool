import * as XLSX from "xlsx";
import { Invoice } from "./invoice";
import { getNextInvoiceNumber, saveInvoice } from "./utils";
const config = await (Bun.file("./config.json")).json();

export interface Assistant {
  path: string;
  workbook: XLSX.WorkBook;
  personSheet: XLSX.WorkSheet;
  servicesSheet: XLSX.WorkSheet;
  customersSheet: XLSX.WorkSheet;
  invoiceWorkbook: XLSX.WorkBook;

  personalData: {
    id: string;
    name: string;
    street: string;
    zip: string;
    city: string;
    email: string;
    taxId: string;
    bankName: string;
    iban: string;
    bic: string;
    taxRate: number;
  };

  services: Object[];
  customers: Object[];
}

export class Assistant {
  constructor(name: string) {
    this.path = `${config.paths.freelancerDirectory}/${name}/Zeiterfassung.xlsx`;
  }

  async initialize(): Promise<void> {
    return new Promise(async (resolve) => {
      const assistantWorkbookFile = Bun.file(this.path);
      this.workbook = XLSX.read(await assistantWorkbookFile.arrayBuffer(), { type: "buffer" });
      this.personSheet = this.workbook.Sheets["Persönliche Daten"];
      this.servicesSheet = this.workbook.Sheets["Leistungen"];
      this.customersSheet = this.workbook.Sheets["Kunden"];

      const invoiceWorkbookFile = Bun.file(config.paths.invoicesExcelFile);
      this.invoiceWorkbook = XLSX.read(await invoiceWorkbookFile.arrayBuffer(), { type: "buffer" });

      this.personalData = {
        id: this.personSheet["B1"]?.v,
        name: this.personSheet["B2"]?.v,
        street: this.personSheet["B3"]?.v,
        zip: String(this.personSheet["B4"]?.v),
        city: this.personSheet["B5"]?.v,
        email: this.personSheet["B6"]?.v,
        taxId: this.personSheet["B7"]?.v,
        taxRate: Number(this.personSheet["B8"]?.v),
        bankName: this.personSheet["B9"]?.v,
        iban: this.personSheet["B10"]?.v,
        bic: this.personSheet["B11"]?.v,
      };

      let customersData = XLSX.utils.sheet_to_json(this.customersSheet);
      customersData = customersData.filter((c: any) => c["ID"] !== undefined);
      this.customers = customersData.map((c: any) => {
        return {
          id: c["ID"],
          company: c["Unternehmen"],
          name: c["Inhaber"],
          street: c["Straße"],
          zip: c["PLZ"],
          city: c["Ort"],
          email: c["Email"],
          contactPerson: c["Kontaktperson"]
        }
      });

      let servicesData = XLSX.utils.sheet_to_json(this.servicesSheet);
      servicesData = servicesData.filter((s: any) => s["ID"] !== undefined);
      this.services = servicesData.map((s: any) => {
        return {
          id: Number(s["ID"]),
          name: s["Leistung"],
          price: Number(s[" Netto "])
        }
      });

      return resolve();
    });
  }

  async generateInvoices(worksheet: string) {
    const _assistantInvoicesCreated = []
    const _timetrackingsSheet = this.workbook.Sheets[worksheet];

    // check if timetrackings sheet exists
    if (!_timetrackingsSheet) {
      console.warn(`\nFür ${this.personalData.name} wurde kein Arbeitsblatt für den Monat "${worksheet}" gefunden.\nBitte überprüfe deine Eingabe oder das Arbeitsblatt in der Excel-Datei.\n`);
      return;
    }

    console.info(`\nRechnungen für ${this.personalData.name} in ${worksheet} werden erstellt...`)

    // get timetrackings from excel sheet
    let _timetrackings = XLSX.utils.sheet_to_json(_timetrackingsSheet);
    _timetrackings = _timetrackings.filter((t: any) => t["Dauer"] && t["Leistung"] && t["Kunde"] && t["Datum"]);

    // validate timetracking inputs
    for (const t of _timetrackings) {
      // check if duration is a number
      if (typeof t["Dauer"] !== "number") {
        console.error(`\n==================================\n[FEHLER] Ungültige Dauer\nAssistentin: ${this.personalData.name}\nArbeitsblatt: ${worksheet}\nZeile: ${t.__rowNum__}\nWert: "${t["Dauer"]}"\n==================================\n`);
        return;
      }

      // check if date is a number
      if (typeof t["Datum"] !== "number") {
        console.error(`\n==================================\n[FEHLER] Ungültiges Datum\nAssistent: ${this.personalData.name}\nArbeitsblatt: ${worksheet}\nZeile: ${t.__rowNum__}\nWert: "${t["Datum"]}"\n==================================\n`);
        return;
      }

      // check if service is a number and exists
      if (!this.services.find((s: any) => s.name == t["Leistung"])) {
        console.error(`\n==================================\n[FEHLER] Leistung nicht gefunden\nAssistent: ${this.personalData.name}\nArbeitsblatt: ${worksheet}\nZeile: ${t.__rowNum__}\nWert: "${t["Leistung"]}"\n==================================\n`);
        return;
      }

      // check if customer exists
      if (!this.customers.find((c: any) => c.company == t["Kunde"])) {
        console.error(`\n==================================\n[FEHLER] Kunde nicht gefunden\nAssistent: ${this.personalData.name}\nArbeitsblatt: ${worksheet}\nZeile: ${t.__rowNum__}\nWert: "${t["Kunde"]}"\n==================================\n`);
        return;
      }
    }

    // create timeTrackings array with formatted data
    _timetrackings = _timetrackings.map((t: any) => {
      const date = new Date("1900-01-01");
      date.setDate(date.getDate() + t["Datum"] - 1);

      return {
        rowNumber: t.__rowNum__,
        date: date.toLocaleDateString("de-DE"),
        startTime: t["Startzeit"],
        endTime: t["Endzeit"],
        pauseDuration: t["Pause"],
        duration: t["Dauer"],
        service: this.services.find((s: any) => s.name == t["Leistung"]),
        customer: this.customers.find((c: any) => c.company == t["Kunde"]),
      }
    });

    // create invoice for each customer
    for (const _customer of this.customers) {
      const _customerTimetrackings = _timetrackings.filter((t: any) => t.customer.id == _customer.id);
      if (_customerTimetrackings.length) {
        const _invoice = await this.generateAssistantInvoice(_customer, _customerTimetrackings, _assistantInvoicesCreated[_assistantInvoicesCreated.length - 1]?.options.invoice.number || "")
        if (_invoice) _assistantInvoicesCreated.push(_invoice)
      }
    }
    
    // if invoices were created
    if (_assistantInvoicesCreated.length) {
      // create provision invoice for MYO
      const _provisionInvoice = await this.generateProvisionInvoice(_assistantInvoicesCreated);

      // generate invoice pdfs and save them to excel invoice workbook
      for (const i of _assistantInvoicesCreated) await saveInvoice(i);
      await saveInvoice(_provisionInvoice);
      console.info(`✅ Rechnungen für ${this.personalData.name} in ${worksheet} wurden erstellt\n`);
    }
  }

  async generateAssistantInvoice(customer: any, timetrackings: any[], lastInvoiceNumber: string = "") {
    const nextInvoiceNumber = await getNextInvoiceNumber(this.personalData, "RE", lastInvoiceNumber);

    // generate invoice items by timeTrackings
    const _items = timetrackings.map((t: any) => {
      return {
        name: t.service.name,
        description: `Am ${t.date} für ${t.duration.toFixed(2).replace(".", ",")} Stunden`,
        date: t.date,
        unit: "Stunde",
        amount: t.duration,
        price: t.service.price,
      }
    });

    // return if no relevant timetrackings can be found
    if (!_items.length) return;

    // create invoice instance using the provided data
    const invoice = new Invoice({
      invoice: {
        number: nextInvoiceNumber,
        taxRate: this.personalData.taxRate,
        message: config.texts.freelancer.message,
        terms: this.personalData.taxRate > 0 ? config.texts.freelancer.invoice.terms : config.texts.freelancer.invoice.taxFreeTerms
      },
      sender: this.personalData,
      recipient: customer,
      items: _items
    })
    
    return invoice
  }

  async generateProvisionInvoice(invoices: Invoice[]): Promise<Invoice> {
    const nextInvoiceNumber = await getNextInvoiceNumber(config.provisionSender, "RE");

    const _items = invoices.map((i: Invoice) => {
      return {
        name: `Provision für Rechnung ${i.options.invoice.number}`,
        description: `${i.total.toFixed(2).replace(".", ",")}€ x 20%`,
        amount: 1,
        unit: "Stück",
        price: i.total * 0.2,
      }
    });

    const invoice = new Invoice({
      invoice: {
        number: nextInvoiceNumber,
        taxRate: 19,
        message: config.texts.provision.invoice.message,
        terms: config.texts.provision.invoice.terms,
      },
      sender: config.provisionSender,
      recipient: this.personalData,
      items: _items
    })
    
    return invoice
  }
}