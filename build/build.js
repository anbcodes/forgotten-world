import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const watchMode = process.argv.includes("--watch");

// project layout
const inputRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(__dirname, "dest");
const publicDir = path.join(__dirname, "public");
const ignoreDir = path.join(inputRoot, "build");

const templatePath = path.join(__dirname, "template.html");
const template = fs.readFileSync(templatePath, "utf-8");

if (!fs.existsSync(outputRoot)) {
  fs.mkdirSync(outputRoot);
}

/* -------------------- markdown build -------------------- */

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (full.startsWith(ignoreDir)) continue;

    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }

  return out;
}

function extract(markdown) {
  const lines = markdown.split("\n");

  let title = "Untitled";
  let subtitle = "";
  let i = 0;

  if (lines[0]?.startsWith("# ")) {
    title = lines[0].slice(2).trim();
    i = 1;
  }

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("#")) break;

    subtitle = line;
    i++;
    break;
  }

  const body = md.render(lines.slice(i).join("\n"));
  return { title, subtitle, body };
}

function outPath(inputFile) {
  const rel = path.relative(inputRoot, inputFile);
  return path.join(outputRoot, rel.replace(/\.md$/, ".html"));
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function buildFile(file) {
  const src = fs.readFileSync(file, "utf-8");
  const { title, subtitle, body } = extract(src);

  const html = template
    .replaceAll("{{title}}", title)
    .replaceAll("{{subtitle}}", subtitle)
    .replaceAll("{{metaTitle}}", title)
    .replaceAll("{{metaDescription}}", subtitle)
    .replaceAll("{{content}}", body);

  const out = outPath(file);
  ensureDir(out);

  fs.writeFileSync(out, html);
  console.log(`[build] ${file} → ${out}`);
}

function buildAllMarkdown() {
  walk(inputRoot).forEach(buildFile);
}

/* -------------------- public folder sync -------------------- */

function copyPublicFile(srcPath) {
  if (!fs.existsSync(srcPath)) return;

  const rel = path.relative(publicDir, srcPath);
  const dest = path.join(outputRoot, rel);

  const stat = fs.statSync(srcPath);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcPath, dest);
  }
}

function removePublicFile(srcPath) {
  const rel = path.relative(publicDir, srcPath);
  const dest = path.join(outputRoot, rel);

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
    console.log(`[public] removed ${rel}`);
  }
}

function copyPublicRecursive(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      copyPublicRecursive(full);
    } else {
      copyPublicFile(full);
    }
  }
}

/* -------------------- watch -------------------- */

function watchMarkdown(dir) {
  if (!fs.existsSync(dir)) return;

  fs.watch(dir, { persistent: true }, (event, filename) => {
    if (!filename) return;

    const full = path.join(dir, filename);

    if (full.startsWith(ignoreDir)) return;

    if (filename.endsWith(".md")) {
      setTimeout(() => {
        if (fs.existsSync(full)) {
          buildFile(full);
        }
      }, 50);
    }
  });

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      watchMarkdown(path.join(dir, entry.name));
    }
  }
}

function watchPublic(dir) {
  if (!fs.existsSync(dir)) return;

  fs.watch(dir, { persistent: true }, (event, filename) => {
    if (!filename) return;

    const full = path.join(dir, filename);

    setTimeout(() => {
      if (fs.existsSync(full)) {
        copyPublicFile(full);
      } else {
        removePublicFile(full);
      }
    }, 50);
  });

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      watchPublic(path.join(dir, entry.name));
    }
  }
}

/* -------------------- run -------------------- */

function buildAll() {
  copyPublicRecursive(publicDir);
  buildAllMarkdown();
}

if (watchMode) {
  buildAll();
  watchMarkdown(inputRoot);
  watchPublic(publicDir);
  console.log("[watch] enabled");
} else {
  buildAll();
}
