import { expect, test, type Page } from "@playwright/test";
import { nav, openApp } from "./helpers";

/**
 * Bill scanning. The test server has no AI provider, so the manual path is the real state.
 * The "automatic reading" case replaces /api/ai/* with test responses (page.route) to check the
 * review-and-confirm UI; it does not verify real OCR.
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const openScanner = async (page: Page) => {
  await nav(page, "Dashboard");
  await page.getByRole("button", { name: /Scan Bill/ }).first().click();
  return page.getByRole("dialog", { name: "Scan a bill" });
};

test("no reader configured: manual entry, validation, duplicate guard, explicit save", async ({ page }) => {
  await openApp(page);
  let d = await openScanner(page);
  await expect(d.getByTestId("reader-status")).toContainText("isn't set up");
  // A photo can still be attached for reference; nothing is read or saved automatically.
  await d.getByTestId("receipt-file").setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: PNG });
  await expect(d.getByTestId("receipt-notice")).toContainText("type the details");
  await expect(d.getByAltText("Bill photo for reference")).toBeVisible();
  await d.getByRole("button", { name: "Save expense" }).click();
  await expect(d.getByRole("alert")).toContainText("Enter the bill total");
  await d.getByLabel("Shop or merchant").fill("Receipt Test Kirana");
  await d.getByLabel("Total paid (₹) *").fill("432.10");
  await d.getByRole("button", { name: "Add item" }).click();
  await d.getByLabel("Item 1 name").fill("Rice");
  await d.getByLabel("Item 1 price").fill("400");
  await expect(d.getByTestId("items-mismatch")).toContainText("Items add up to ₹400.00 but the total is ₹432.10");
  await d.getByRole("button", { name: "Save expense" }).click();
  await expect(d.getByTestId("receipt-saved")).toHaveText("Saved ₹432.10 at Receipt Test Kirana.");
  await d.getByRole("button", { name: "Done" }).click();
  await nav(page, "Transactions");
  await expect(page.getByText("Receipt Test Kirana").first()).toBeVisible();

  // Same bill again: flagged as a possible duplicate and not saved until confirmed.
  d = await openScanner(page);
  await d.getByRole("button", { name: "Enter manually" }).click();
  await d.getByLabel("Shop or merchant").fill("Receipt Test Kirana");
  await d.getByLabel("Total paid (₹) *").fill("432.10");
  await expect(d.getByText("This may already be recorded.")).toBeVisible();
  await expect(d.getByRole("button", { name: "Save expense" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog", { name: "Discard unsaved changes?" }).getByRole("button", { name: "Discard" }).click();
  await expect(d).toBeHidden();
  await nav(page, "Transactions");
  await expect(page.getByText("Receipt Test Kirana")).toHaveCount(1);
});

test("with a (test) reader: draft is shown for review, can be corrected, and can be stopped", async ({ page }) => {
  let slow = true;
  await page.route("**/api/ai/status", r => r.fulfill({ json: { configured: true, provider: "Google Gemini", model: "test-model" } }));
  await page.route("**/api/ai/scan-receipt", async r => {
    if (slow) { await new Promise(res => setTimeout(res, 4000)); return r.fulfill({ json: {} }).catch(() => {}); }
    return r.fulfill({ json: { merchant: "Scan Test Cafe", date: "2026-11-05", totalAmount: 682.5, items: [{ name: "Thali", price: 650 }], confidence: 0.9 } });
  });
  await openApp(page);
  const d = await openScanner(page);
  await expect(d.getByTestId("reader-status")).toContainText("Automatic reading is on");
  await d.getByTestId("receipt-file").setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: PNG });
  await expect(d.getByText("Reading the bill…")).toBeVisible();
  await d.getByRole("button", { name: "Stop" }).click();
  await expect(d.getByTestId("receipt-notice")).toContainText("Stopped. Nothing was read or saved.");

  slow = false;
  await d.getByRole("button", { name: "Back" }).click();
  await d.getByTestId("receipt-file").setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: PNG });
  await expect(d.getByTestId("receipt-notice")).toContainText("Check every field");
  await expect(d.getByLabel("Shop or merchant")).toHaveValue("Scan Test Cafe");
  await expect(d.getByLabel("Total paid (₹) *")).toHaveValue("682.50");
  await d.getByLabel("Total paid (₹) *").fill("690.00"); // the person corrects a misread
  await d.getByRole("button", { name: "Save expense" }).click();
  await expect(d.getByTestId("receipt-saved")).toHaveText("Saved ₹690.00 at Scan Test Cafe.");
});
