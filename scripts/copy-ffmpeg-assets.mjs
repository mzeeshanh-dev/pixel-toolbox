// Copies the FFmpeg WebAssembly runtime into /public so it is served as
// same-origin static files. The files are loaded at runtime (never bundled),
// which keeps FFmpeg out of every route bundle and avoids bundler worker issues.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules", "@ffmpeg");
const version = JSON.parse(
  readFileSync(join(modules, "core", "package.json"), "utf8"),
).version;
const target = join(root, "public", "vendor", "ffmpeg");
const versioned = join(target, version);

rmSync(target, { recursive: true, force: true });
mkdirSync(join(versioned, "esm"), { recursive: true });

for (const file of ["classes.js", "const.js", "errors.js", "index.js", "types.js", "utils.js", "worker.js"]) {
  cpSync(join(modules, "ffmpeg", "dist", "esm", file), join(versioned, "esm", file));
}
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  cpSync(join(modules, "core", "dist", "esm", file), join(versioned, file));
}

if (!existsSync(join(versioned, "ffmpeg-core.wasm"))) {
  console.error("FFmpeg core assets were not copied.");
  process.exit(1);
}
console.log(`FFmpeg ${version} assets copied to public/vendor/ffmpeg/${version}`);
