import inquirer from 'inquirer';
import { readdir } from 'node:fs/promises';
import { Assistant } from "./lib/assistant";
import { Invoice } from "./lib/invoice";
import { getNextInvoiceNumber, saveInvoice } from "./lib/utils";

const config = await (Bun.file("config.json")).json();


(async () => {
  const action = (await inquirer.prompt([
    {
      type: "list",
      message: "Was möchtest du tun?",
      name: "action",
      choices: [
        "Rechnungen erstellen",
        "Rechnung stornieren",
        "Rechnung löschen"
      ]
    }
  ]))["action"];

  switch (action) {
    case "Rechnungen erstellen":
      createInvoices();
      break;
    case "Rechnung neu generieren":
      break;
    case "Rechnung stornieren":
      cancelInvoice();
      break;
    case "Rechnung löschen":
      deleteInvoice();
      break;
  }
})();


async function createInvoices() {
  let freelancerNames = await readdir(config.paths.freelancerDirectory);
  freelancerNames = freelancerNames.filter((fileName) => !fileName.startsWith("."));
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
          await assistant.initialize();
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


async function cancelInvoice() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Welche Rechnung soll storniert werden? (z.B. MYO-F001-0001)",
        name: "invoiceNumber",
      }
    ]).then(async (answers) => {
      try {
        const invoiceOptions = await Bun.file(`${config.paths.invoiceOptionsDirectory}/${answers.invoiceNumber}.json`).json();

        invoiceOptions.invoice.name = `Stornorechnung für ${invoiceOptions.invoice.number}`;
        invoiceOptions.invoice.message = config.texts.cancellation.message;
        invoiceOptions.invoice.terms = invoiceOptions.invoice.taxRate === 0 ? config.texts.cancellation.taxFreeTerms : config.texts.cancellation.terms;
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
          console.error(`[FEHLER] Rechnungsnummer "${answers.invoiceNumber}" wurde nicht gefunden.`);
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


async function deleteInvoice() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Welche Rechnung soll gelöscht werden? (z.B. MYO-F001-0001)",
        name: "invoiceNumber",
      },
      {
        type: "confirm",
        message: "Die Löschung kann nicht rückgängig gemacht werden!!!\nBist du sicher, dass die Rechnung gelöscht werden soll?",
        name: "confirm",
        default: false
      }
    ]).then(async (answers) => {
      console.log("Deleting invoice... (not implemented yet)");
    }).catch((error) => {
      if (error.isTtyError) {
        console.error("Prompt couldn't be rendered in the current environment")
      } else {
        console.error("Something went wrong!", error);
      }
    });
}
