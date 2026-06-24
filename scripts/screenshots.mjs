import puppeteer from "puppeteer";
import { mkdirSync } from "fs";

const BASE = "http://localhost:5173";
const OUT = "assets";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/snap/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(3000);

  // Click Demo
  await page.click("text=Demo");
  await sleep(3000);

  await page.screenshot({ path: `${OUT}/screenshot_matrix.png` });
  console.log("1/6 matrix");

  // Publication mode
  await page.click("text=Pub Mode");
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/screenshot_publication.png` });
  await page.click("text=Pub Mode");
  await sleep(500);
  console.log("2/6 publication");

  // 3D
  await page.click("text=3D");
  await sleep(3000);
  await page.screenshot({ path: `${OUT}/screenshot_3d.png` });
  await page.click("text=3D");
  await sleep(500);
  console.log("3/6 3d");

  // Close any open panels
  await page.keyboard.press("Escape");
  await sleep(500);
  await page.keyboard.press("Escape");
  await sleep(500);

  // Import dialog
  await page.click("text=Import");
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/screenshot_import.png` });
  console.log("4/6 import");

  // Close import, then click Collaborate
  await page.keyboard.press("Escape");
  await sleep(500);
  const collaborateBtn = await page.$("text=Collaborate");
  if (collaborateBtn) {
    await collaborateBtn.click();
    await sleep(1000);
  }
  await page.screenshot({ path: `${OUT}/screenshot_collaborate.png` });
  console.log("5/6 collaborate");

  // Phase groups
  const groupsBtn = await page.$("text=Groups");
  if (groupsBtn) {
    await groupsBtn.click();
    await sleep(1000);
    await page.screenshot({ path: `${OUT}/screenshot_groups.png` });
    console.log("6/6 groups");
  }

  await browser.close();
  console.log("Done");
}

main().catch(console.error);
