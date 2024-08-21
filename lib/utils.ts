import fs from "node:fs";
import { Invoice } from "./invoice";
import prisma from "./prisma";

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

export async function getNextInvoiceNumber(sender: any, type: "RE" | "ST" = "RE", lastInvoiceNumber: string = ""): Promise<string> {
  return new Promise(async (resolve) => {
    if (!lastInvoiceNumber) {
      const lastInvoice = await prisma.invoice.findFirst({
        where: {
          sender: { id: sender.id },
          type: type
        },
        orderBy: { createdAt: "desc" }
      })

      if (!lastInvoice) {
        return resolve(`${sender.id}-${type}-0001`);
      } else {
        lastInvoiceNumber = lastInvoice.number;
      }
    }

    if (!/^.*-.*-\d{4}$/.test(lastInvoiceNumber)) throw new Error(`[FEHLER] Ungültige Rechnungsnummer: "${lastInvoiceNumber}"\nRechnungserstellung wurde abgebrochen.\n`);
    const lastInvoiceNumberParts = lastInvoiceNumber.split("-");
    resolve(`${sender.id}-${type}-${String(Number(lastInvoiceNumberParts[lastInvoiceNumberParts.length - 1]) + 1).padStart(4, "0")}`);
  });
}

export async function saveInvoice(invoice: Invoice, mode: "new" | "regenerate" = "new"): Promise<void> {
  return new Promise(async (resolve) => {
    // save invoice to database
    if (mode === "new") {
      await prisma.invoice.create({
        data: {
          number: invoice.options.invoice.number,
          type: invoice.options.invoice.type,
          date: invoice.options.invoice.date,
          total: invoice.total,
          options: JSON.stringify(invoice.options),
          recipient: {
            connectOrCreate: {
              where: { id: invoice.options.sender.id },
              create: {
                id: invoice.options.sender.id,
                name: invoice.options.sender.name
              }
            }
          },
          sender: {
            connectOrCreate: {
              where: { id: invoice.options.sender.id },
              create: {
                id: invoice.options.sender.id,
                name: invoice.options.sender.name
              }
            }
          }
        }
      });
    } else {
      await prisma.invoice.update({
        where: { number: invoice.options.invoice.number },
        data: {
          number: invoice.options.invoice.number,
          date: invoiceDate,
          total: invoice.total,
          options: JSON.stringify(invoice.options),
          recipient: {
            connectOrCreate: {
              where: { id: invoice.options.sender.id },
              create: {
                id: invoice.options.sender.id,
                name: invoice.options.sender.name
              }
            }
          },
          sender: {
            connectOrCreate: {
              where: { id: invoice.options.sender.id },
              create: {
                id: invoice.options.sender.id,
                name: invoice.options.sender.name
              }
            }
          }
        }
      });
    }

    // save options to json file
    fs.writeFile(`${config.paths.invoiceOptionsDirectory}/${invoice.options.invoice.number}.json`, JSON.stringify(invoice.options, null, 2), err => {
      if (err) console.error(err);
    });

    // generate invoice pdf
    const invoiceDirectory = invoice.options.sender.id === "KY" ? config.paths.provisionInvoicesDirectory : `${config.paths.freelancerDirectory}/${invoice.options.sender.name}/Rechnungen`;
    invoice.create(`${invoiceDirectory}/${invoice.options.invoice.number}.pdf`);
    
    // log invoice creation
    console.info(`${invoice.options.invoice.number} - ${invoice.options.sender.name} an ${invoice.options.recipient.name} (${invoice.total.toFixed(2).replace(".", ",")}€)`)
    return resolve()
  });
}

export async function deleteInvoice(invoice: Invoice): Promise<void> {
  return new Promise(async (resolve) => {
    const invoiceNumber = invoice.options.invoice.number;
    const invoiceDirectory = invoice.options.sender.id === "KY" ? config.paths.provisionInvoicesDirectory : `${config.paths.freelancerDirectory}/${invoice.options.sender.name}/Rechnungen`;

    // delete invoice options json file and invoice pdf
    fs.unlink(`${config.paths.invoiceOptionsDirectory}/${invoiceNumber}.json`, (err) => {
      if (err) console.error(err);
    });
    fs.unlink(`${invoiceDirectory}/${invoiceNumber}.pdf`, (err) => {
      if (err) console.error(err);
    });

    // delete invoice from database
    await prisma.invoice.delete({
      where: { number: invoiceNumber }
    });
    
    resolve()
  });
}