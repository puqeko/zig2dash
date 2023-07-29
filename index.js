#!/usr/bin/env node
import fs from 'fs-extra';
import inq from 'inquirer';
import { Sequelize } from 'sequelize';
import shell from 'shelljs';
import { generate as genstd } from './genstd.js';
import { generate as genguide } from "./genguide.js";

const BASE_URL = new URL("https://ziglang.org/documentation/");

const main = async () => {

  const version = (await inq.prompt({
    type: "list",
    name: "ver",
    message: `Version`,
    choices: ["master", "0.11.0", "0.10.1", "0.10.0", "0.9.1"]
  })).ver;

  const docPrefix = `./${version}/Zig.docset`;

  let shouldInit = true;
  if (fs.existsSync(docPrefix)) {
    const res = (await inq.prompt({
      type: "list",
      name: "res",
      message: `Merge with existing '${docPrefix}' or replace it?`,
      choices: ["Merge", "Replace", "Cancel"]
    })).res;
    if (res == "Cancel") return;
    if (res == "Replace") await fs.rm(`./${version}/`, {recursive: true});
    shouldInit = res == "Replace";
  }

  if (shouldInit) {
    const db = new Sequelize({
      dialect: 'sqlite',
      logging: false,
      storage: `${docPrefix}/Contents/Resources/docSet.dsidx`
    });
    await fs.copy("template", docPrefix);
    await db.query(`CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);`);
    await db.query(`CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);`);
  }

  const langRefUrl = BASE_URL.href + version + "/";
  const tasks = (await inq.prompt({
    type: "checkbox",
    name: "res",
    message: `Tasks`,
    choices: [
      {name: "Zig Standard Library", checked: true},
      {name: "Zig Language Reference", checked: true},
      {name: "Create Zig.tgz", checked: true}]
  })).res;

  if (tasks.includes("Zig Language Reference")) await genguide(langRefUrl, docPrefix, version);
  if (tasks.includes("Zig Standard Library")) await genstd(langRefUrl + "std/", docPrefix);
  if (tasks.includes("Create Zig.tgz")) {
    // generate tar file for upload to https://github.com/Kapeli/Dash-User-Contributions
    console.log("Generating archive...");
    shell.exec(`cd ./${version}/; tar --exclude='.DS_Store' -czf Zig.tgz Zig.docset`);
  }
};

main();