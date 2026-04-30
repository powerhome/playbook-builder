#!/usr/bin/env node
/**
 * Smoke-test the published tarball: build → pack → install in a temp dir → run CLI.
 * Does not call the Figma API (no FIGMA_TOKEN / network required for the checks below).
 */

const { execSync, spawnSync } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

const root = path.join(__dirname, "..")
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))

function run(label, fn) {
  process.stderr.write(`[verify-package] ${label}\n`)
  fn()
  process.stderr.write(`[verify-package] OK: ${label}\n`)
}

function main() {
  process.chdir(root)
  execSync("npm run build", { stdio: "inherit" })

  const scopedName = pkg.name.replace("/", "-").replace("@", "")
  const tarballName = `${scopedName}-${pkg.version}.tgz`
  const tarballPath = path.join(root, tarballName)

  execSync("npm pack", { stdio: "inherit" })

  if (!fs.existsSync(tarballPath)) {
    process.stderr.write("Tarball not found after npm pack\n")
    process.exit(1)
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-pkg-test-"))
  try {
    execSync(`npm install "${tarballPath}"`, { cwd: tmp, stdio: "inherit" })

    const envNoToken = { ...process.env }
    delete envNoToken.FIGMA_TOKEN

    run("missing --url shows usage (exit 1)", () => {
      const result = spawnSync("npx", ["playbook-builder"], {
        cwd: tmp,
        encoding: "utf8",
        env: envNoToken,
      })
      if (result.status !== 1) process.exit(1)
      if (!/Usage/i.test(result.stderr)) process.exit(1)
    })

    run("missing FIGMA_TOKEN fails clearly (exit 2)", () => {
      const result = spawnSync(
        "npx",
        ["playbook-builder", "--url", "https://www.figma.com/design/abc123/X?node-id=1-2"],
        { cwd: tmp, encoding: "utf8", env: envNoToken }
      )
      if (result.status !== 2) process.exit(1)
      if (!/FIGMA_TOKEN/i.test(result.stderr)) process.exit(1)
    })
  } finally {
    try { fs.unlinkSync(tarballPath) } catch { /* ignore */ }
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  process.stderr.write("[verify-package] All smoke checks passed.\n")
}

main()
