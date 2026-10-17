# MooEmma Motors website: setup guide

The website lives on Netlify. Your car list, incoming requests and buyer orders live in one Google Sheet. A small Google Apps Script connects the two.

## What's in this folder

- `website/` is the whole website. This is the folder you upload to Netlify.
  - `index.html` is the home page: your cars, the "send us a car" service, how buying works and FAQs.
  - `how-we-work.html` explains your US validation system and the four-step process.
  - `about.html` is the About page.
  - `track.html` is where buyers check their car's progress and payments.
  - `config.js` holds your settings. Keep it in the same folder as the pages.
- `google-apps-script/Code.gs` is the script you paste into your Google Sheet.

## Step 1: Set up the Google Sheet

1. Create a new Google Sheet, for example "MooEmma Motors".
2. Open **Extensions > Apps Script**.
3. Delete what's in the editor, paste in everything from `Code.gs`, and save.
4. Optional: put your email address in `NOTIFY_EMAIL` near the top to get an email for every new request.
5. In the function dropdown at the top, choose **setup** and click **Run**. Authorize it when asked (choose your account, then **Advanced > Go to project > Allow**).

This creates three tabs, **Cars**, **Requests** and **Orders**, plus a **MooEmma Motors** menu in the sheet.

**Already set up the earlier version?** Paste the new `Code.gs` and run **setup** again. It adds the new columns without touching your data. You can then delete the old columns that are no longer used: **Damage** and **Repair Plan** in Cars, and the old stage columns (Deposit confirmed, Won at auction, In the workshop, Ready for inspection) in Orders.

## Step 2: Publish the script as a web app

1. In Apps Script, click **Deploy > New deployment**.
2. Click the gear icon and choose **Web app**.
3. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
4. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.

## Step 3: Fill in your settings

Open `website/config.js` in a text editor (Notepad, TextEdit or VS Code):

```js
sheetApiUrl: 'https://script.google.com/macros/s/XXXX/exec',
whatsappNumber: '2348031234567',   // no +, no spaces, no leading 0
phoneDisplay: '+234 803 123 4567',
email: 'you@example.com',
```

The same file sets **when each instalment is due** (see "Payment plans" below).

## Step 4: Put it on Netlify

1. Go to **app.netlify.com/drop** and drag the whole `website` folder onto the page.
2. Rename the site in **Site configuration** if you like, and connect your own domain later.
3. Put your live address in `siteUrl` in `config.js` and in `SITE_URL` in `Code.gs`, so tracking links point to your site.

To update the site later, drag the folder onto **Deploys** in your Netlify site again.

---

## Payment plans

Each car can offer one or more plans. Enter them in the **Payment Plans** column of the Cars tab.

**Format:** percentages that add up to 100, split by `/`. Separate different plans with commas.

| You type | Buyers see |
|---|---|
| `100` | Full payment only |
| `100, 60/40` | Full payment, or 60% / 40% |
| `100, 70/30, 50/30/20` | Full payment, 70% / 30%, or 50% / 30% / 20% |

The sheet rejects anything in the wrong format, and the website ignores any plan that doesn't add up to 100. If the cell is empty, the car shows full payment only.

**When each part is due** is set once in `config.js`, by how many parts the plan has:

| Parts | Due |
|---|---|
| 1 | Before we buy the car |
| 2 | Before we buy the car, then when the car arrives in Nigeria |
| 3 | Before we buy the car, when the car is shipped, before delivery |
| 4 | Before we buy, when shipped, when it arrives, before delivery |

Change the wording in `config.js` to match your terms. The website works out the naira amount of each part from the car's price and shows the full schedule on each car's page.

---

## Day-to-day use

### Adding a car (Cars tab)

Add a row and set **Show on Website** to Yes. The site picks it up within about a minute, or straight away if you click **MooEmma Motors > Refresh website car list now**.

| Column | What to put |
|---|---|
| ID | A unique code, e.g. CAR-014 |
| Condition | e.g. Clean title. No accident record. One previous owner. |
| Price (NGN) | Numbers only, e.g. 24500000 |
| Price Note | e.g. Cleared and ready in Lagos |
| Payment Plans | e.g. 100, 60/40 (see above) |
| Ready In (weeks) | e.g. 6-8 |
| Request By | Optional date. Hidden after it passes. |
| Location | Where the car is now, e.g. Dealer in Houston, Texas |
| Images | Photo links separated by commas. The first is the cover photo. |
| Status | Available, Reserved or Sold |
| Internal: ... | Private. Never shown on the website. |

**Photos from Google Drive:** share the folder as **Anyone with the link: Viewer**, then copy each photo's link into the Images cell.

### Handling requests (Requests tab)

Every form on the site lands here with a reference number and a **Type**:

- **Car request** is someone asking for one of your listed cars. It includes their chosen payment plan.
- **Car link** is someone who found a car online and wants you to bring it in. The link is in **Listing Link**. Check the seller is genuine and the car qualifies, then send a quote.
- **Custom search** is someone describing a car they want you to find.
- **Waitlist** is someone waiting on a reserved car.

**Delivery** shows whether they'll pick up in Lagos or want delivery, with the address if needed. Use the **Status** dropdown to track each request.

### Tracking a buyer's car (Orders tab)

1. When a buyer makes their first payment, add a row: buyer name and phone, **Service** (Our listing, Customer link or Custom search), the car, **Delivery To**, **Total Price (NGN)**, **Payment Plan** (e.g. 60/40) and **Amount Paid (NGN)**.
2. Click **MooEmma Motors > Create missing tracking codes**. The order gets a code like MM-7Q4K-P2XD.
3. Click the order's row, then **MooEmma Motors > Get tracking message for selected order**. Copy the message and send it on WhatsApp.
4. As the car moves, type the date in that stage's column (the yellow columns): Payment confirmed, Car purchased, US title received, At US port, Shipped, Arrived in Lagos, Cleared customs, Final checks, Ready for handover, Delivered.
5. When a payment comes in, update **Amount Paid (NGN)**. Set **Next Payment (NGN)** and **Next Payment Due** for the next instalment. The buyer sees their total, what they've paid, the balance and what's due next.
6. Use **Latest Update** for a note to the buyer and **Update Photos** for photo links.
7. After delivery, set **Active** to No if you want the code to stop working.

Buyers only see their first name, the car, the stages, their payments, your notes and photos. They never see phone numbers, listing links or internal notes, and codes are random, so one buyer can't guess another's.

## If you edit Code.gs later

Saving the script doesn't update the live website. Go to **Deploy > Manage deployments**, click the pencil icon, set **Version** to **New version**, and click **Deploy**. Your URL stays the same.

## Before going live, review

- The timeline on the site says **about 6 to 8 weeks**. Change it if your real average is different (home page "Why us", "How buying works" and FAQ).
- The FAQ answers and the payment due-stages in `config.js`, so they match your actual terms.
- The About page story in `about.html`. Rewrite "Why we started" in your own words.
- Your WhatsApp number, phone and email in `config.js`.
