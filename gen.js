import fs from 'fs-extra';
import inq from 'inquirer';
import { Sequelize } from 'sequelize';
import { generate as genstd } from './genstd.js';
import { generate as genguide } from "./genguide.js";

const BASE_URL = new URL("https://ziglang.org/documentation/");

const main = async () => {

  let docName = (await inq.prompt({
    type: 'text',
    name: 'res',
    message: "Docset name",
    default: "zig.docset"
  })).res;

  if (!docName.endsWith(".docset")) docName += ".docset";

  let shouldInit = true;
  if (fs.existsSync(docName)) {
    const res = (await inq.prompt({
      type: "list",
      name: "res",
      message: `Merge with existing '${docName}' or replace it?`,
      choices: ["Merge", "Replace", "Canel"]
    })).res;
    if (res == "Cancel") return;
    if (res == "Replace") await fs.rm(docName, {recursive: true});
    shouldInit = res == "Replace";
  }

  if (shouldInit) {
    const db = new Sequelize({
      dialect: 'sqlite',
      logging: false,
      storage: `${docName}/Contents/Resources/docSet.dsidx`
    });
    await fs.copy("template", docName);
    await db.query(`CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);`);
    await db.query(`CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);`);
  }

  const langRefUrl = BASE_URL.href + (await inq.prompt({
    type: "list",
    name: "ver",
    message: `Version?`,
    choices: ["master", "0.9.1"]
  })).ver + "/";
  const todo = (await inq.prompt({
    type: "checkbox",
    name: "res",
    message: `Will process`,
    choices: [
      {name: "Zig Language Reference", checked: true},
      {name: "Zig Standard Library", checked: true}]
  })).res;

  if (todo.includes("Zig Language Reference")) await genguide(langRefUrl, docName);
  if (todo.includes("Zig Standard Library")) await genstd(langRefUrl + "std/", docName);
};

main();