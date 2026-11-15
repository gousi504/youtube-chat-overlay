// Builds dist/youtube-chat-overlay.zip : a ready-to-run package (Node.js runtime bundled).
// Usage: node tools/build-release.js
const fs = require("fs");
const path = require("path");
const { execSync, execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const name = "youtube-chat-overlay";
const stage = path.join(dist, name);
const zip = path.join(dist, name + ".zip");
const version = require(path.join(root, "package.json")).version;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, "runtime"), { recursive: true });

for (const f of ["server.js", "package.json", "package-lock.json", "start.bat", "update.bat", "README.md"]) {
  fs.copyFileSync(path.join(root, f), path.join(stage, f));
}
fs.cpSync(path.join(root, "public"), path.join(stage, "public"), { recursive: true });
fs.copyFileSync(process.execPath, path.join(stage, "runtime", "node.exe"));
fs.writeFileSync(path.join(stage, "version.txt"), "v" + version + "\r\n");

execSync("npm ci --omit=dev --no-audit --no-fund", { cwd: stage, stdio: "inherit" });

// never ship personal settings
if (fs.existsSync(path.join(stage, "config.json"))) throw new Error("config.json must not be in the package");

execFileSync("C:\\Windows\\System32\\tar.exe", ["-a", "-cf", zip, "-C", dist, name], { stdio: "inherit" });
console.log("built:", zip, (fs.statSync(zip).size / 1048576).toFixed(1) + " MB", "v" + version, "node " + process.version);
