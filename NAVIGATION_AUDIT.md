# Navigation & Cancel Audit (2026-11-06)

**How every overlay behaves now:** every overlay uses `src/components/ui/Modal.tsx`.
- **Dialog semantics:** `role="dialog"`, `aria-modal`, and a name taken from the dialog's visible heading.
- **Leaving:** an X button (44 px target), Escape, a click on the backdrop and the browser Back button all go through one guarded close.
- **Unsaved changes:** if something was typed, a prompt offers **Keep editing / Discard**. Closing never saves anything, and Discard clears what was typed.
- **Focus:** focus moves into the dialog, Tab stays inside, and focus returns to the button that opened it. Keys are handled at the document level, so Escape still works if focus fell to the page.
- **Screens:** each screen gets a browser history entry, so Back/Forward move between screens. If a dialog is open, Back closes it first.
- **Automated tests:**
  - `e2e/navigation.spec.ts` (7 tests).
  - Dialog-specific checks in `groups-flexible`, `ai-assistant`, `receipt` and `recurring`.
  - An axe scan of the new dialogs in `screens.spec.ts`.

| Screen / overlay | Back / Close | Cancel | Discard prompt when typed | Notes |
|---|---|---|---|---|
| Add expense / income | X, Esc, backdrop, browser Back | **Cancel** (new) | amount, merchant, description, notes, natural-language text | Discard clears the form. Tested. |
| Voice entry | X, Esc, Back | – | transcript or parsed result | Switching to voice from Add expense closes that form first. |
| Bill scan | X, Esc, Back | Cancel (step 1); **Back** to step 1 from review | photo chosen or review open | Saved only on **Save expense**; Stop while reading. Tested. |
| AI assistant | X, Esc, Back | **Stop** for a running request | unsent question | Closing aborts any request. Tested. |
| Daily summary | X, Esc, Back | – | – | Read-only. |
| Payment sync demo (simulated) | X, Esc, Back, Close | – | – | Labelled simulation. Tested. |
| Nightly cash check | X, Esc, Back, Close | – | amount or description | |
| More drawer (phone) | X, Esc, Back | – | – | Choosing a screen replaces the drawer's history entry. |
| Create group | X, Esc, Back | **Cancel** | any field or person row changed | Tested. |
| Edit group details | X, Esc, Back | **Cancel** | any change | Members are managed in the Members tab. Tested. |
| Add group expense | X, Esc, Back | **Cancel** | description, amount or any split value | Save is disabled until the split adds up. Tested. |
| Settle payment | X, Esc, Back | – | – | Validates the amount; part-payments allowed. Tested. |
| Join a group | X, Esc, Back | – | code typed | |
| Member rename (inline) | – | **Cancel**, Esc | – | Display name only. Tested. |
| Group expense edit (inline) | – | Cancel | – | Existing, unchanged. |
| Create budget / goal | X, Esc, Back | Cancel | name or amount typed | Tested. |
| Cash reconcile | X, Esc, Back | Cancel | changed amount or reason | |
| Add recurring bill | X, Esc, Back | Cancel | name or amount | Tested. |
| Recurring bill edit (inline) | – | Cancel | – | Existing. |
| Transaction details / edit | X, Esc, Back, Close | Cancel (edit form) | while editing | Delete asks for confirmation (existing). |
| CSV import (device) | X, Esc, Back | Cancel | pasted CSV not yet imported | |
| Statement import (account) | – | **Cancel** at preview | – | Nothing is added until **Add N entries** (existing). Tested. |
| Discard prompt itself | Esc = Keep editing | Keep editing / Discard | – | `role="alertdialog"`. |

**Not covered, and why:**
- The header's persona and accessibility menus open on hover only. That's a known keyboard/touch gap, listed in KNOWN_LIMITATIONS; they aren't wizards, and nothing is lost by leaving them.
- The family space and support forms are single-step inline forms (one field plus a button), so there's no step to go back to.
- The landing page "Start" is the entry point; Back from the first screen leaves the site, as browsers normally do.
