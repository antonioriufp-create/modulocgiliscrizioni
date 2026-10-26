// Rigenera i modelli PDF incorporati nelle funzioni: npm run template
import fs from "node:fs";
const pairs = [
  ["assets/modulo-delega.pdf", "netlify/lib/template.mjs"],
  ["assets/modulo-delega-gallura.pdf", "netlify/lib/template-gallura.mjs"],
];
for (const [src, out] of pairs) {
  fs.writeFileSync(out, `export default "${fs.readFileSync(src).toString("base64")}";\n`);
  console.log(`${src} -> ${out}`);
}
