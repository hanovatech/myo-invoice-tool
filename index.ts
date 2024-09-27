import fs from "node:fs";
import inquirer from 'inquirer';
import { readdir } from 'node:fs/promises';
import { Assistant } from "./lib/assistant";
import { Invoice } from "./lib/invoice";
import { getNextInvoiceNumber, saveInvoice, deleteInvoice } from "./lib/utils";

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

(async () => {
  const action = (await inquirer.prompt([
    {
      type: "list",
      message: "Was möchtest du tun?",
      name: "action",
      choices: [
        "Rechnungen erstellen",
        "Rechnung stornieren",
        "Rechnung löschen",
        "Rechnung neu generieren",
        "Abbrechen"
      ]
    }
  ]))["action"];

  switch (action) {
    case "Rechnungen erstellen":
      createInvoicesCommand();
      break;
    case "Rechnung stornieren":
      cancelInvoiceCommand();
      break;
    case "Rechnung löschen":
      deleteInvoiceCommand();
      break;
    case "Rechnung neu generieren":
      regenerateInvoiceCommand();
      break;
    default:
      return;
  }
})();


async function createInvoicesCommand() {
  let freelancerNames = await readdir(config.paths.freelancerDirectory);
  freelancerNames = freelancerNames.filter((fileName) => !fileName.startsWith(".") || !fileName.includes("ORGA"));
  const assistants = freelancerNames.map((c) => ({ name: c }));

  inquirer
    .prompt([
      {
        type: "input",
        message: "Für welches Arbeitsblatt? (z.B. 2024-05)",
        name: "worksheet",
      },
      {
        type: "checkbox",
        message: "Für welche Assistentinnen?",
        name: "assistants",
        choices: assistants,
      }
    ])
    .then(async (answers) => {
      try {
        for (const name of answers.assistants) {
          const assistant = new Assistant(name);
          assistant.generateInvoices(answers.worksheet);
        }
      } catch(err) {
        console.error(err);
      }
    })
    .catch((error) => {
      if (error.isTtyError) {
        console.error("Prompt couldn't be rendered in the current environment");
      } else {
        console.error("Something went wrong!", error);
      }
    });
}


async function cancelInvoiceCommand() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Welche Rechnung soll storniert werden? (z.B. MYO-F001-0001)",
        name: "invoiceNumber",
      }
    ]).then(async (answers) => {
      try {
        const invoiceOptions = JSON.parse(fs.readFileSync(`${config.paths.invoiceOptionsDirectory}/${answers.invoiceNumber}.json`, 'utf8'));

        invoiceOptions.invoice.type = "ST"
        invoiceOptions.invoice.name = `Stornorechnung für ${invoiceOptions.invoice.number}`;
        invoiceOptions.invoice.message = config.texts.cancellation.invoice.message;
        invoiceOptions.invoice.terms = invoiceOptions.invoice.taxRate === 0 ? config.texts.cancellation.invoice.taxFreeTerms : config.texts.cancellation.invoice.terms;
        invoiceOptions.items = invoiceOptions.items.map((item) => {
          return {
            ...item,
            price: item.price * -1,
          };
        });

        const nextInvoiceNumber = await getNextInvoiceNumber(invoiceOptions.sender, "ST");
        invoiceOptions.invoice.number = nextInvoiceNumber;
        
        const canceledInvoice = new Invoice(invoiceOptions);
        await saveInvoice(canceledInvoice);
        console.info(`✅ Stornorechnung für ${answers.invoiceNumber} wurde erstellt\n`)
      } catch(err) {
        if (err.syscall === "open" && err.code === "ENOENT") {
          console.error(`[FEHLER] Rechnungsnummer "${answers.invoiceNumber}" wurde nicht gefunden`);
        } else {
          console.error(err);
        }
      }
    }).catch((error) => {
      if (error.isTtyError) {
        console.error("Prompt couldn't be rendered in the current environment")
      } else {
        console.error("Something went wrong!", error);
      }
    });
}

async function deleteInvoiceCommand() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Welche Rechnung soll gelöscht werden? (z.B. KY-RE-0001)",
        name: "invoiceNumber",
      },
      {
        type: "confirm",
        message: "Die Löschung kann nicht rückgängig gemacht werden. Bist du sicher?",
        name: "confirm",
      }
    ]).then(async (answers) => {
      if (!answers.confirm) return console.info("Vorgang abgebrochen\n");
      const invoiceOptions = JSON.parse(fs.readFileSync(`${config.paths.invoiceOptionsDirectory}/${answers.invoiceNumber}.json`, 'utf8'));
      const invoice = new Invoice(invoiceOptions);
      await deleteInvoice(invoice);
      console.info(`✅ Rechnung ${answers.invoiceNumber} wurde gelöscht\n`)
    }).catch((error) => {
      if (error.isTtyError) {
        console.error("Prompt couldn't be rendered in the current environment")
      } else {
        console.error("Something went wrong!", error);
      }
    });
}


async function regenerateInvoiceCommand() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Welche Rechnung soll neu generiert werden? (z.B. KY-RE-0001)",
        name: "invoiceNumber",
      }
    ]).then(async (answers) => {
      try {
        const invoiceOptions = JSON.parse(fs.readFileSync(`${config.paths.invoiceOptionsDirectory}/${answers.invoiceNumber}.json`, 'utf8'));
        const invoice = new Invoice(invoiceOptions);
        await saveInvoice(invoice, "regenerate");
        console.info(`✅ Rechnung ${answers.invoiceNumber} wurde neu generiert\n`)
      } catch(err) {
        if (err.syscall === "open" && err.code === "ENOENT") {
          console.error(`[FEHLER] Rechnungsnummer "${answers.invoiceNumber}" wurde nicht gefunden`);
        } else {
          console.error(err);
        }
      }
    }).catch((error) => {
      if (error.isTtyError) {
        console.error("Prompt couldn't be rendered in the current environment")
      } else {
        console.error("Something went wrong!", error);
      }
    });
}