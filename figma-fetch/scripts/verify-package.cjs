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

function main() {
  process.chdir(root)
  console.error("[verify-package] npm run build")
  execSync("npm run build", { stdio: "inherit" })

  const tarballName = `${pkg.name}-${pkg.version}.tgz`
  const tarballPath = path.join(root, tarballName)

  console.error("[verify-package] npm pack →", tarballName)
  execSync("npm pack", { stdio: "inherit" })

  if (!fs.existsSync(tarballPath)) {
    console.error(`Expected tarball at ${tarballPath}`)
    process.exit(1)
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "figma-fetch-pkg-test-"))
  try {
    console.error("[verify-package] npm install from tarball in", tmp)
    execSync(`npm install "${tarballPath}"`, { cwd: tmp, stdio: "inherit" })

    // 1) Missing --url → usage() → exit 1
    const envNoToken = { ...process.env }
    delete envNoToken.FIGMA_TOKEN
    const noUrl = spawnSync("npx", ["figma-fetch"], {
      cwd: tmp,
      encoding: "utf8",
      env: envNoToken,
    })
    if (noUrl.status !== 1) {
      console.error("Expected exit code 1 when --url is missing, got", noUrl.status)
      process.exit(1)
    }
    if (!/Usage:\s*figma-fetch/i.test(noUrl.stderr) && !/Usage:/i.test(noUrl.stderr)) {
      console.error("Expected usage text on stderr:", noUrl.stderr)
      process.exit(1)
    }
    console.error("[verify-package] OK: missing --url shows usage (exit 1)")

    // 2) With --url but no token → clear error
    const noToken = spawnSync(
      "npx",
      ["figma-fetch", "--url", "https://www.figma.com/design/abc123/X?node-id=1-2"],
      { cwd: tmp, encoding: "utf8", env: envNoToken }
    )
    if (noToken.status !== 1) {
      console.error("Expected exit code 1 when FIGMA_TOKEN is missing, got", noToken.status)
      process.exit(1)
    }
    if (!/FIGMA_TOKEN/i.test(noToken.stderr)) {
      console.error("Expected FIGMA_TOKEN error on stderr:", noToken.stderr)
      process.exit(1)
    }
    console.error("[verify-package] OK: missing FIGMA_TOKEN fails clearly (exit 1)")
  } finally {
    try {
      fs.unlinkSync(tarballPath)
    } catch {
      /* ignore */
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  console.error("[verify-package] All package smoke checks passed.")
}

main()
