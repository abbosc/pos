# Plan and data model

## How the bar works (and what the app models)

```
Purchase (expense) ──► WAREHOUSE ──refill──► STAND ──count──► sold → snack revenue
Paper sheet (end of day) ──────────────────────────────────► drinks sold + gifts → drink revenue

Expected cash = opening + snack sales + drink sales − expenses paid from cash − cash taken out + cash put in
Farq (difference) = counted cash − expected cash
```

- One admin account, used from a phone or a laptop browser.
- Cash only. No order entry at the counter.
- All money is whole soʻm (integers). Time zone: Asia/Tashkent.

## Features (v1 — built)

| Page | Route | What it does |
|---|---|---|
| Asosiy (dashboard) | `/` | Expected cash, today's sales and profit, quick actions, low-stock list, reminders (sheet not entered, nothing counted) |
| Vitrinani sanash | `/vitrina` | Enter the current count on the stand for any products → sold = expected − counted. Review screen before saving. Undo a count (until the cash desk is closed). A surplus is treated as an unrecorded refill from the warehouse (or a correction if the warehouse is short) |
| Vitrinani toʻldirish | `/toldirish` | Move pieces warehouse → stand. Can't move more than the warehouse has |
| Mahsulot xaridi | `/xarid` | Buy several products at once: qty + total paid. Adds to warehouse, updates the weighted average cost, creates an expense (category *Mahsulot xaridi*). "Paid from cash" toggle. Undo while the goods are still in the warehouse |
| Ichimliklar varagʻi | `/varaq` | The paper sheet: Sotildi / Sovgʻa per drink, grouped like the paper, live Summa and Jami savdo. Any date. Keeps the price of that day when edited later |
| Kassa | `/kassa` | Opening cash (first time), live breakdown of expected cash, close with counted amount → Farq, then "how much change do you leave?" → records the withdrawal. Take money out / put money in. History of closes; reopen the last close to fix mistakes |
| Xarajatlar | `/xarajatlar` | Monthly list, filter by category, add/edit/delete, manage categories, "paid from cash" toggle |
| Mahsulotlar | `/mahsulotlar` | Products with photo, prices, cost, stand/warehouse quantity, stock value. Detail page: history, write-off (expired / damaged / gift, counted as a loss at cost), quantity correction (not a sale), archive/delete |
| Ichimliklar menyusi | `/ichimliklar` | Drinks, groups, price, **cost per cup** → profit per drink. Photo. Setting a cost fills it into earlier sheets that had none |
| Hisobot | `/hisobot` | Today / yesterday / week / month / last month / custom. Sales, profit, expenses, cash flow; daily sales chart; per drink, per snack, per expense category, per day tables |
| Ombor tarixi | `/tarix` | Every stock movement, filterable |
| Sovgʻa / yeyilgan | `/chiqim` | Snacks that left without a sale — gift, eaten by staff, spoiled, other — several products at once, from stand or warehouse. Must be entered before the stand count. Shown in reports by reason, at cost |
| TV menyu | `/menyu` | Public (no login) full-screen drinks menu for the TV in the Sodiq School “Bar menyusi” design: navy header with logo, 4 columns, photo cards (drink photos rotate, defaults bundled), “TAVSIYA” badges (drink setting), prices in thousands. Auto-sized to fit one screen, refreshed every minute, gentle animations, keeps the screen awake |
| Idishlar | `/idishlar` | Kraft bottles, transparent bottles, cups: stock, receive (optional price → expense), count (shows difference), write-off, history. Each drink is assigned one bottle type, and "+ Chashka" if it can also be served in a cup |

### Bottles and cups
- The sheet has a **Chashkada** column for drinks marked "+ Chashka": how many of sold + gift were served in a cup.
- Saving a sheet uses: (sold + gift − in cup) of the drink's bottle, plus (in cup) cups. Re-saving replaces the
  previous usage; deleting the sheet gives it back.
- **Idishlar tekshiruvi** on the sheet: enter the bottles and cups actually used that day; each shows ✓ or the difference.

### Rules that keep the numbers honest
- **Snack sale price** is taken at the moment of the count. Count the stand *before* changing a sell price.
- **Average cost** = weighted average over all pieces on hand, updated on each purchase.
- **Profit (Foyda)** = sales − cost of what was sold − cost of gifts − cost of write-offs.
  **Cash flow (Pul oqimi)** = sales − all expenses in the period (purchases included).
  Ingredient expenses (milk, beans…) are *not* subtracted again from profit — they are already
  represented by each drink's cost per cup.
- **Closing the cash desk locks** everything in that period (sheets, counts, cash expenses, withdrawals).
  To fix something, reopen the last close, fix, close again.
- Products and drinks with history can't be deleted — mark them inactive instead.

## Data model (PostgreSQL)

| Table | Purpose |
|---|---|
| `products` | Snacks: name, sell_price, avg_cost, warehouse_qty, stand_qty, low_stock_level, image_path, active |
| `stock_movements` | Ledger of every change: kind (`opening` `purchase` `refill` `sale` `writeoff` `correction`), signed warehouse_delta / stand_delta, unit_price and unit_cost at that time, links to purchase / stand count / cash close |
| `purchases` | Purchase header: date, total, paid_from_cash |
| `stand_counts` | One row per count; its sales are the `sale` movements pointing at it |
| `drinks` | Menu: name, group, price, cost_per_cup, image |
| `drink_sheets` / `drink_sheet_lines` | One sheet per date; lines hold sold_qty, gift_qty and the price/cost of that day |
| `expense_categories` / `expenses` | Expenses with category, amount, paid_from_cash; `purchase_id` when created by a purchase |
| `cash_movements` | Money taken out of / put into the desk |
| `containers` / `container_movements` | Bottle and cup stock; movements: purchase, usage (from a sheet), count, writeoff |
| `drink_sheet_container_counts` | Containers counted as used on a sheet's day |
| `cash_closes` | Each close: expected, counted (difference = counted − expected). The counted amount opens the next period |

Cash-affecting rows carry `cash_close_id`: `NULL` = belongs to the current open period.

## Telegram (ready, optional)

All changes go through the service layer and emit domain events (`server/src/lib/events.ts`).
Today: with `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` set, the server posts the cash close
summary and low-stock alerts to a chat. A future bot (commands like `/kassa`, `/bugun`, recording an
expense by message) can live in the same server process and call the same services.

## Ideas for later
- Telegram bot commands (see above); daily report on a schedule.
- Multiple accounts with roles (barista vs. admin) and an audit of who did what.
- Ingredient stock (milk, beans) with per-drink recipes instead of a fixed cost per cup.
- Export reports to Excel / PDF.
- Offline mode (queue changes when the school Wi-Fi drops).
