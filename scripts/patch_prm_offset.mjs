#!/usr/bin/env node
/**
 * Adiciona prmOffset a cada param do catalog.json lendo os .zrc.
 *
 * Correspondência: catalog[i].asset === "G5_NomeEfeito"
 *                  .zrc filename  === "G5_NomeEfeito.zrc"
 *
 * <PrmOffset> presente e > 0 → prmOffset = valor
 * <PrmOffset> ausente ou 0   → prmOffset = 0 (default)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, "..", "src", "data", "catalog.json");
const ZRC_DIR = process.argv[2];

if (!ZRC_DIR) {
  console.error("Uso: node scripts/patch_prm_offset.mjs <pasta-zrc>");
  process.exit(1);
}

function parseXml(text) {
  // Extrai todos os <Ctrl type="dsp" prm="N"> com seus filhos PrmOffset
  const ctrls = [];
  const ctrlRe = /<Ctrl\s+index="(\d+)"\s+type="dsp"\s+prm="(\d+)"[^>]*>([\s\S]*?)<\/Ctrl>/g;
  let m;
  while ((m = ctrlRe.exec(text)) !== null) {
    const prm = parseInt(m[2], 10);
    const inner = m[3];
    const offsetMatch = /<PrmOffset>(\d+)<\/PrmOffset>/.exec(inner);
    const prmOffset = offsetMatch ? parseInt(offsetMatch[1], 10) : 0;
    ctrls.push({ prm, prmOffset });
  }
  return ctrls;
}

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));

let updated = 0;
let skipped = 0;

for (const effect of catalog) {
  const zrcPath = path.join(ZRC_DIR, `${effect.asset}.zrc`);
  if (!fs.existsSync(zrcPath)) {
    skipped++;
    continue;
  }

  let text;
  try {
    // .zrc são binários com XML embutido — extrai somente a parte XML
    const buf = fs.readFileSync(zrcPath);
    const xmlStart = buf.indexOf(Buffer.from("<?xml"));
    text = xmlStart >= 0 ? buf.slice(xmlStart).toString("utf-8", 0, 32768) : "";
  } catch {
    skipped++;
    continue;
  }

  const ctrls = parseXml(text);
  if (!ctrls.length) { skipped++; continue; }

  // Mapeia prm → prmOffset
  const prmOffsetMap = new Map(ctrls.map(c => [c.prm, c.prmOffset]));

  for (const param of effect.params) {
    const off = prmOffsetMap.get(param.prm) ?? 0;
    if (off !== 0) {
      param.prmOffset = off;
    } else {
      delete param.prmOffset; // 0 é default, não precisa guardar
    }
  }
  updated++;
}

fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), "utf-8");
console.log(`Atualizado: ${updated} efeitos, pulado: ${skipped}`);
