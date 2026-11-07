/** Renders investor-demo/video/slides.html sections to 1920x1080 PNGs (and the thumbnail). No app or network needed. */
import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";

const V = "D:/BAGLA_FINANCE_WORKSPACE/investor-demo/video";
const IDS = ["title", "intro", "problem", "solution", "security", "pricing", "economics", "architecture", "quality", "roadmap", "stage", "funding", "closing", "thumb"];

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
test("render slides", async ({ page }) => {
  mkdirSync(`${V}/slides`, { recursive: true });
  for (const id of IDS) {
    await page.goto(`file:///${V}/slides.html#${id}`);
    await page.evaluate(id => { document.querySelectorAll("section").forEach(s => { (s as HTMLElement).style.display = s.id === id ? "block" : "none"; }); }, id);
    await page.waitForTimeout(300);
    await page.screenshot({ path: id === "thumb" ? "D:/BAGLA_FINANCE_WORKSPACE/investor-demo/BAGLA_FINANCE_VIDEO_THUMBNAIL.png" : `${V}/slides/${id}.png` });
  }
});
