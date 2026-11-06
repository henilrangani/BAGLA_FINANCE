# Bill / Receipt Scanning: Implementation

## Flow (`src/components/ReceiptScannerModal.tsx`)
1. **Choose:** *Take photo* (camera, `capture="environment"`), *Choose photo*, or *Enter manually*. The screen says whether automatic reading is set up (`reader.available()`).
2. **Validate on the device:** JPEG/PNG/WebP only, at most 4 MB. Wrong types and large files are refused with a message before anything is sent.
3. **Read (only if a reader is available):** "Reading the bill…" with **Stop**, which aborts the request and saves nothing.
4. **Review:** every field is editable: shop, total (required), date (required), category (chosen, never guessed), payment method, save to my expenses or to a group (split equally), and items. If the items don't add up to the total, a note says so; the total is what's saved.
5. **Duplicate check:** same amount within ±1 day with a similar merchant or description (`detectDuplicateTransaction`). Saving then needs an explicit "It's a different bill".
6. **Save:** only on **Save expense**, through the normal `addTransaction` / `addGroupExpense` paths (server API in account mode). A success or failure message follows.
7. **Leave:** Back to step 1, Cancel, X, Esc or browser Back. Once a photo or form is open, there's a discard prompt.

The photo is shown for reference only. It isn't stored and isn't sent anywhere unless automatic reading is on.

## Provider-independent reader (`src/services/receiptReader.ts`)
```ts
interface ReceiptReader { name; available(signal?): Promise<boolean>; read(dataUrl, mimeType, signal?): Promise<ReadResult> }
```
- The only implementation, `serverReceiptReader`, calls this app's server (`/api/ai/scan-receipt`). The server uses Gemini only when `GEMINI_API_KEY` is set.
- The reading becomes a draft in integer paise.
  - An unreadable total gives `ok: false` ("Enter the details yourself"), never a guess.
  - Negative or invalid prices become 0, and nameless items are dropped.
- Errors are mapped to plain reasons:
  - 413: too large.
  - 415: wrong type.
  - 429: too many.
  - Network failure, or the server says it's unavailable.
- Another OCR provider (on-device, or a different vendor) can be added by implementing the same interface. The screen doesn't change.

## Handled cases
| Case | Behaviour |
|---|---|
| Wrong file type, over 4 MB | Refused on the device with a message |
| Corrupt file | FileReader error: "Couldn't open that file" |
| PDF | Refused by the type check ("Use a JPEG, PNG or WebP photo"); the screen also notes PDFs aren't supported yet |
| Blurry or unreadable total | `ok: false`, then manual entry with the reason |
| Network failure, provider down | Reason shown, then manual entry; nothing saved |
| Cancel while reading | Stop: "Stopped. Nothing was read or saved." |
| Duplicate | Warning, plus an explicit confirmation checkbox |
| Retry | Back, then choose the photo again |

## Tests
- `src/services/receiptReader.test.ts` (3): availability; exact-paise parsing that drops junk; failures.
- `e2e/receipt.spec.ts`:
  - Manual path: validation, items mismatch, explicit save, duplicate guard, discard.
  - Mocked reader: review, correction, Stop.
- Real OCR is **not verified** (no provider ★).
