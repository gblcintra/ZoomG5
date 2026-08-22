#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "fx");

const PNG_SIG  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_TAIL = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const NAME_RE  = /[A-Za-z0-9_-]{1,40}\.(?:png|xml)/gi;

function findAll(buf, pattern) {
  const positions = [];
  let pos = 0;
  while (true) {
    const idx = buf.indexOf(pattern, pos);
    if (idx === -1) break;
    positions.push(idx);
    pos = idx + 1;
  }
  return positions;
}

function extract(filePath) {
  const data = fs.readFileSync(filePath);
  NAME_RE.lastIndex = 0;
  const allNames = [...data.toString("latin1").matchAll(NAME_RE)].map(m => m[0]);
  const pngNames = allNames.filter(n => n.toLowerCase().endsWith(".png"));
  const pngStarts = findAll(data, PNG_SIG);
  const pngEnds   = findAll(data, PNG_TAIL).map(p => p + 8);

  if (pngNames.length !== pngStarts.length || pngNames.length !== pngEnds.length) {
    console.log(`  ! ${path.basename(filePath)}: ${pngNames.length} nomes / ${pngStarts.length} imagens — pulando`);
    return [];
  }

  const key  = path.basename(filePath, ".zrc");
  const dest = path.join(OUT, key);
  fs.mkdirSync(dest, { recursive: true });

  for (let i = 0; i < pngNames.length; i++) {
    const name = pngNames[i].toLowerCase();
    fs.writeFileSync(path.join(dest, name), data.subarray(pngStarts[i], pngEnds[i]));
  }
  return pngNames;
}

function walkZrc(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkZrc(full));
    else if (entry.name.toLowerCase().endsWith(".zrc")) results.push(full);
  }
  return results.sort();
}

const flags = new Set(process.argv.slice(2).filter(a => a.startsWith("--")));
const src   = process.argv.slice(2).find(a => !a.startsWith("--"));

if (!src) {
  console.error("Uso: node scripts/extract_assets.mjs <pasta> [--if-missing]");
  process.exit(1);
}

if (flags.has("--if-missing") && fs.existsSync(path.join(OUT, "manifest.json"))) {
  process.exit(0);
}

const files = walkZrc(src);
if (!files.length) {
  console.error(`Nenhum .zrc em ${src}`);
  process.exit(1);
}

const manifest = {};
let total = 0;
for (const file of files) {
  const got = extract(file);
  if (got.length) {
    manifest[path.basename(file, ".zrc")] = got.map(n => n.toLowerCase());
    total += got.length;
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 0));
console.log(`${Object.keys(manifest).length} efeitos, ${total} imagens → public/fx/`);
