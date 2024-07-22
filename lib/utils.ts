import * as XLSX from "xlsx";
import { Invoice } from "./invoice";

const config = await (Bun.file("./config.json")).json();

export async function getNextInvoiceNumber(sender: any, type: "RE" | "ST" = "RE", lastInvoiceNumber: string = ""): Promise<string> {
  return new Promise(async (resolve) => {
    const invoiceWorkbookFile = Bun.file(config.paths.invoicesExcelFile);
    const invoiceWorkbook = XLSX.read(await invoiceWorkbookFile.arrayBuffer(), { type: "buffer" });
    const invoiceSheet = invoiceWorkbook.Sheets[sender.name];

    if (!invoiceSheet) throw new Error(`[FEHLER] Datenblatt für "${sender.name}" existiert nicht in der Rechnungsübersicht!\nRechnungserstellung wurde abgebrochen.\n`);

    if (!lastInvoiceNumber) {
      let invoices = XLSX.utils.sheet_to_json(invoiceSheet);
      invoices = invoices.filter((i: any) => i["Rechnungsnummer"].startsWith(`${sender.id}-${type}`));
      const lastInvoice: any = invoices[invoices.length - 1];
      if (!lastInvoice) return resolve(`${sender.id}-${type}-0001`);
      lastInvoiceNumber = lastInvoice["Rechnungsnummer"];
    }

    if (!/^.*-.*-\d{4}$/.test(lastInvoiceNumber)) throw new Error(`[FEHLER] Ungültige Rechnungsnummer: "${lastInvoiceNumber}"\nRechnungserstellung wurde abgebrochen.\n`);
    const lastInvoiceNumberParts = lastInvoiceNumber.split("-");
    return resolve(`${sender.id}-${type}-${String(Number(lastInvoiceNumberParts[lastInvoiceNumberParts.length - 1]) + 1).padStart(4, "0")}`)
  });
}

export function saveInvoice(invoice: Invoice, mode: "new" | "regenerate" = "new"): Promise<void> {
  return new Promise(async (resolve) => {
    // add invoice to excel invoice workbook
    if (mode === "new") {
      const invoiceWorkbookFile = Bun.file(config.paths.invoicesExcelFile);
      const invoiceWorkbook = XLSX.read(await invoiceWorkbookFile.arrayBuffer(), { type: "buffer" });
      const invoiceSheet = invoiceWorkbook.Sheets[invoice.options.sender.name];
      XLSX.utils.sheet_add_aoa(
        invoiceSheet,
        [[ invoice.options.invoice.number, invoice.options.invoice.date, invoice.total.toFixed(2).replace(".", ","), invoice.options.recipient.name]],
        { origin: -1 }
      );
      const writer = invoiceWorkbookFile.writer();
      writer.write(XLSX.write(invoiceWorkbook, { bookType: "xlsx", type: "buffer" }));
      writer.flush();
      writer.end();
    }

    // save options to json file
    await Bun.write(`${config.paths.invoiceOptionsDirectory}/${invoice.options.invoice.number}.json`, JSON.stringify(invoice.options, null, 2));

    // generate invoice pdf
    const invoiceDirectory = invoice.options.sender.id === "KY" ? config.paths.provisionInvoicesDirectory : `${config.paths.freelancerDirectory}/${invoice.options.sender.name}/Rechnungen`;
    invoice.create(`${invoiceDirectory}/${invoice.options.invoice.number}.pdf`);
    
    // log invoice creation
    console.info(`${invoice.options.invoice.number} - ${invoice.options.sender.name} an ${invoice.options.recipient.name} (${invoice.total.toFixed(2).replace(".", ",")}€)`)
    return resolve()
  });
}