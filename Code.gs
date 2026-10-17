/**
 * MooEmma Motors: Google Sheets backend
 * ---------------------------------------------------------------
 * - The website reads the "Cars" tab (only rows with "Show on Website" = Yes).
 * - Requests from the website are saved to the "Requests" tab.
 * - The tracking page reads the "Orders" tab using each buyer's tracking code.
 * - Columns that start with "Internal:" are never sent to the website.
 *
 * First time: run setup() once from the Apps Script editor, then deploy as a web app.
 * Already set up? Run setup() again after pasting this version: it adds any new columns
 * without touching your data.
 */

const SETTINGS = {
  CARS_SHEET: 'Cars',
  REQUESTS_SHEET: 'Requests',
  ORDERS_SHEET: 'Orders',
  SITE_URL: '',              // your live website, e.g. 'https://mooemmamotors.netlify.app' (used for tracking links)
  NOTIFY_EMAIL: '',          // e.g. 'you@gmail.com' to get an email for every new request
  REQUEST_PREFIX: 'MM',      // request numbers look like MM-261012-004
  CACHE_SECONDS: 60          // sheet changes show on the website within this many seconds
};

/* Cars tab: sheet column header -> name the website uses */
const PUBLIC_FIELDS = {
  'ID': 'id',
  'Make': 'make',
  'Model': 'model',
  'Year': 'year',
  'Trim': 'trim',
  'Body Type': 'bodyType',
  'Transmission': 'transmission',
  'Fuel': 'fuel',
  'Mileage (km)': 'mileage',
  'Colour': 'colour',
  'Condition': 'condition',
  'Price (NGN)': 'price',
  'Price Note': 'priceNote',
  'Payment Plans': 'paymentPlans',
  'Ready In (weeks)': 'readyIn',
  'Request By': 'requestBy',
  'Location': 'location',
  'Images': 'images',
  'Description': 'description',
  'Status': 'status',
  'Featured': 'featured'
};
const CAR_HEADERS = Object.keys(PUBLIC_FIELDS)
  .concat(['Show on Website', 'Internal: Purchase Cost (USD)', 'Internal: Notes']);

const REQUEST_HEADERS = ['Timestamp', 'Request ID', 'Type', 'Car ID', 'Car', 'Listing Link', 'Listed Price (USD)',
  'Name', 'WhatsApp / Phone', 'Email', 'City / State', 'Contact Via', 'Payment Plan', 'Delivery',
  'Delivery Address', 'Car Wanted', 'Years', 'Budget (NGN)', 'Notes', 'Status', 'Follow-up Notes'];

/* Tracking stages, in order. Each one is a date column in the Orders tab.
   If you rename one here, rename it on track.html (STAGE_INFO) too. */
const STAGES = ['Payment confirmed', 'Car purchased', 'US title received', 'At US port', 'Shipped',
  'Arrived in Lagos', 'Cleared customs', 'Final checks', 'Ready for handover', 'Delivered'];

const ORDER_HEADERS = ['Tracking Code', 'Request ID', 'Service', 'Buyer Name', 'Buyer Phone', 'Car ID', 'Car',
  'Listing Link', 'VIN (last 6)', 'Delivery To', 'Total Price (NGN)', 'Payment Plan', 'Amount Paid (NGN)',
  'Next Payment (NGN)', 'Next Payment Due', 'Estimated Delivery']
  .concat(STAGES).concat(['Latest Update', 'Update Photos', 'Active', 'Internal: Notes']);

const PLAN_HELP = 'Percentages that add up to 100, split by "/". Separate plans with commas. ' +
  'Examples: 100 (full payment only) | 100, 60/40 | 100, 70/30, 50/30/20';

/* ---------------- Website reads cars, or looks up an order ---------------- */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'track') return json_(trackOrder_(p.code));

    const cache = CacheService.getScriptCache();
    const cached = cache.get('cars');
    if (cached) return json_(JSON.parse(cached));

    const payload = { ok: true, cars: readCars_(), updated: new Date().toISOString() };
    try { cache.put('cars', JSON.stringify(payload), SETTINGS.CACHE_SECONDS); } catch (err) { /* too large to cache */ }
    return json_(payload);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function readCars_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS.CARS_SHEET);
  if (!sheet) throw new Error('No sheet named "' + SETTINGS.CARS_SHEET + '"');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const get = getter_(values[0]);
  const tz = Session.getScriptTimeZone();

  return values.slice(1)
    .filter(row => String(get(row, 'ID')).trim() !== '' && isYes_(get(row, 'Show on Website')))
    .map(row => {
      const car = {};
      Object.keys(PUBLIC_FIELDS).forEach(header => {
        let v = get(row, header);
        if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        car[PUBLIC_FIELDS[header]] = v;
      });
      return car;
    });
}

function trackOrder_(code) {
  const wanted = normCode_(code);
  if (wanted.length < 6) return { ok: false, notFound: true };
  const sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS.ORDERS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, notFound: true };
  const values = sheet.getDataRange().getValues();
  const get = getter_(values[0]);
  const tz = Session.getScriptTimeZone();
  const day = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '').trim();
  const text = h => String(get(row, h)).trim();
  const money = h => { const n = Number(String(get(row, h)).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };

  const row = values.slice(1).find(r => normCode_(get(r, 'Tracking Code')) === wanted);
  if (!row || text('Active').toLowerCase() === 'no') return { ok: false, notFound: true };

  // Only buyer-safe details are returned. Phone numbers, links and internal notes stay in the sheet.
  const stages = STAGES.map(name => ({ name: name, date: day(get(row, name)) }));
  const dates = stages.map(s => s.date).filter(Boolean).sort();
  const carId = text('Car ID');
  return {
    ok: true,
    order: {
      code: text('Tracking Code'),
      firstName: text('Buyer Name').split(/\s+/)[0],
      service: text('Service'),
      car: text('Car') || carId,
      carId: carId,
      vin6: text('VIN (last 6)').slice(-6),
      deliveryTo: text('Delivery To'),
      eta: day(get(row, 'Estimated Delivery')),
      update: text('Latest Update'),
      updatedAt: dates.length ? dates[dates.length - 1] : '',
      photos: text('Update Photos').split(/[\n,]+/).map(x => x.trim()).filter(Boolean),
      carImage: coverPhoto_(carId),
      payment: {
        total: money('Total Price (NGN)'),
        plan: planText_(text('Payment Plan')),
        paid: money('Amount Paid (NGN)'),
        next: money('Next Payment (NGN)'),
        nextDue: day(get(row, 'Next Payment Due'))
      },
      stages: stages
    }
  };
}

function coverPhoto_(carId) {
  if (!carId) return '';
  const sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS.CARS_SHEET);
  if (!sheet) return '';
  const values = sheet.getDataRange().getValues();
  const get = getter_(values[0]);
  const row = values.slice(1).find(r => String(get(r, 'ID')).trim() === carId);
  return row ? String(get(row, 'Images')).split(/[\n,]+/)[0].trim() : '';
}

/* ---------------- Website sends a request ---------------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const p = (e && e.parameter) || {};

    // Spam trap: real visitors never fill this hidden field
    if (p.website) return json_({ ok: true, requestId: SETTINGS.REQUEST_PREFIX + '-000000-000' });

    const name = clean_(p.name, 100);
    const phone = clean_(p.phone, 30);
    if (!name || !phone) return json_({ ok: false, error: 'Name and WhatsApp number are required.' });
    const link = String(p.listingLink || '').trim().slice(0, 500);
    if (p.type === 'Car link' && !/^https?:\/\/\S+\.\S+/i.test(link)) {
      return json_({ ok: false, error: 'Please paste the full link to the car, starting with https://' });
    }

    const sheet = ensureSheet_(SETTINGS.REQUESTS_SHEET, REQUEST_HEADERS);
    const now = new Date();
    const tz = Session.getScriptTimeZone();
    const seq = String(sheet.getLastRow()).padStart(3, '0');
    const requestId = SETTINGS.REQUEST_PREFIX + '-' + Utilities.formatDate(now, tz, 'yyMMdd') + '-' + seq;

    const fields = {
      'Timestamp': now, 'Request ID': requestId, 'Type': clean_(p.type, 40),
      'Car ID': clean_(p.carId, 40), 'Car': clean_(p.carTitle, 120),
      'Listing Link': clean_(link, 500), 'Listed Price (USD)': clean_(p.listedPrice, 40),
      'Name': name, 'WhatsApp / Phone': phone, 'Email': clean_(p.email, 120), 'City / State': clean_(p.city, 80),
      'Contact Via': clean_(p.contactVia, 30), 'Payment Plan': clean_(p.paymentPlan, 40),
      'Delivery': clean_(p.delivery, 40), 'Delivery Address': clean_(p.deliveryAddress, 300),
      'Car Wanted': clean_(p.wantedCar, 120), 'Years': clean_(p.years, 60), 'Budget (NGN)': clean_(p.budget, 40),
      'Notes': clean_(p.notes, 1500), 'Status': 'New'
    };
    // Written by column name, so you can reorder or add columns in the Requests tab
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    sheet.appendRow(head.map(h => fields[h] !== undefined ? fields[h] : ''));

    if (SETTINGS.NOTIFY_EMAIL) {
      const what = p.carTitle ? p.carTitle + ' (' + p.carId + ')' : (link || p.wantedCar || 'a car');
      MailApp.sendEmail({
        to: SETTINGS.NOTIFY_EMAIL,
        subject: 'New ' + (p.type || 'request') + ' ' + requestId + ': ' + what,
        body: Object.keys(fields).filter(k => fields[k] !== '').map(k => k + ': ' + fields[k]).join('\n')
      });
    }
    return json_({ ok: true, requestId: requestId });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ---------------- One-time setup (safe to run again) ---------------- */
function setup() {
  const cars = ensureSheet_(SETTINGS.CARS_SHEET, CAR_HEADERS);
  const requests = ensureSheet_(SETTINGS.REQUESTS_SHEET, REQUEST_HEADERS);
  const orders = ensureSheet_(SETTINGS.ORDERS_SHEET, ORDER_HEADERS);

  dropdown_(cars, 'Status', ['Available', 'Reserved', 'Sold']);
  dropdown_(cars, 'Show on Website', ['Yes', 'No']);
  dropdown_(cars, 'Featured', ['Yes', 'No']);
  dropdown_(requests, 'Status', ['New', 'Contacted', 'Checking link', 'Quote sent', 'Payment received',
    'Converted to order', 'Not possible', 'Cancelled']);
  dropdown_(orders, 'Service', ['Our listing', 'Customer link', 'Custom search']);
  dropdown_(orders, 'Active', ['Yes', 'No']);

  // Payment plans: stored as plain text so Sheets doesn't turn 60/40 into a date
  [[cars, 'Payment Plans'], [orders, 'Payment Plan']].forEach(([sheet, h]) => {
    const c = colOf_(sheet, h);
    if (!c) return;
    const letter = columnLetter_(c);
    const rule = SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied('=REGEXMATCH(TO_TEXT(' + letter + '2),"^ *\\d{1,3}( */ *\\d{1,3})*( *, *\\d{1,3}( */ *\\d{1,3})*)* *$")')
      .setAllowInvalid(false).setHelpText(PLAN_HELP).build();
    sheet.getRange(2, c, 999, 1).setNumberFormat('@').setDataValidation(rule);
    sheet.getRange(1, c).setNote(PLAN_HELP);
  });

  // Date columns with a date picker
  STAGES.concat(['Estimated Delivery', 'Next Payment Due']).forEach(h => {
    const c = colOf_(orders, h);
    if (!c) return;
    orders.getRange(2, c, 999, 1).setNumberFormat('d mmm yyyy')
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
    if (STAGES.indexOf(h) > -1) orders.getRange(1, c).setBackground('#FCEFC7');
  });

  // Money columns
  [[cars, 'Price (NGN)'], [orders, 'Total Price (NGN)'], [orders, 'Amount Paid (NGN)'], [orders, 'Next Payment (NGN)']]
    .forEach(([sheet, h]) => { const c = colOf_(sheet, h); if (c) sheet.getRange(2, c, 999, 1).setNumberFormat('#,##0'); });

  // Private columns in pink
  [[cars, CAR_HEADERS], [orders, ORDER_HEADERS]].forEach(([sheet, headers]) => {
    headers.forEach(h => {
      if (h.indexOf('Internal:') === 0 || h === 'Buyer Phone' || (sheet === orders && h === 'Listing Link')) {
        const c = colOf_(sheet, h);
        if (c) sheet.getRange(1, c).setBackground('#F8E3E1');
      }
    });
  });

  if (cars.getLastRow() < 2) {
    const sample = {
      'ID': 'CAR-001', 'Make': 'Toyota', 'Model': 'Camry', 'Year': 2018, 'Trim': 'SE', 'Body Type': 'Sedan',
      'Transmission': 'Automatic', 'Fuel': 'Petrol', 'Mileage (km)': 76000, 'Colour': 'Silver',
      'Condition': 'Clean title. No accident record. Two previous owners.',
      'Price (NGN)': 24500000, 'Price Note': 'Cleared and ready in Lagos', 'Payment Plans': '100, 60/40',
      'Ready In (weeks)': '6-8', 'Request By': '', 'Location': 'Dealer in Houston, Texas', 'Images': '',
      'Description': 'Popular, cheap to maintain and easy to resell.', 'Status': 'Available', 'Featured': 'Yes',
      'Show on Website': 'Yes', 'Internal: Purchase Cost (USD)': 9800, 'Internal: Notes': 'Sample row. Edit or delete.'
    };
    const head = cars.getRange(1, 1, 1, cars.getLastColumn()).getValues()[0].map(h => String(h).trim());
    cars.appendRow(head.map(h => sample[h] !== undefined ? sample[h] : ''));
  }
  onOpen();
  SpreadsheetApp.getActive().toast('Cars, Requests and Orders tabs are ready.', 'MooEmma Motors', 5);
}

/* ---------------- Menu and tracking codes ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('MooEmma Motors')
    .addItem('Create missing tracking codes', 'createTrackingCodes')
    .addItem('Get tracking message for selected order', 'showTrackingMessage')
    .addSeparator()
    .addItem('Refresh website car list now', 'clearCache')
    .addToUi();
}

// Gives every order row with a buyer or car a random, hard-to-guess code like MM-7Q4K-P2XD
function createTrackingCodes() {
  const sheet = ensureSheet_(SETTINGS.ORDERS_SHEET, ORDER_HEADERS);
  const values = sheet.getDataRange().getValues();
  const get = getter_(values[0]);
  const codeCol = colOf_(sheet, 'Tracking Code');
  const used = new Set(values.slice(1).map(r => normCode_(get(r, 'Tracking Code'))).filter(Boolean));
  let made = 0;
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (String(get(r, 'Tracking Code')).trim()) continue;
    if (!String(get(r, 'Buyer Name')).trim() && !String(get(r, 'Car')).trim() && !String(get(r, 'Car ID')).trim()) continue;
    let code;
    do { code = newCode_(); } while (used.has(normCode_(code)));
    used.add(normCode_(code));
    sheet.getRange(i + 1, codeCol).setValue(code);
    made++;
  }
  SpreadsheetApp.getActive().toast(made ? made + ' tracking code(s) created.' : 'Every order already has a code.', 'MooEmma Motors', 5);
}

// Shows a ready-to-send WhatsApp message for the order row you've clicked on
function showTrackingMessage() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActive().getActiveSheet();
  if (sheet.getName() !== SETTINGS.ORDERS_SHEET) { ui.alert('Click a row in the Orders tab first.'); return; }
  const rowNum = sheet.getActiveRange().getRow();
  if (rowNum < 2) { ui.alert('Click a row with an order first.'); return; }
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = sheet.getRange(rowNum, 1, 1, head.length).getValues()[0];
  const get = getter_(head);
  const code = String(get(row, 'Tracking Code')).trim();
  if (!code) { ui.alert('This order has no tracking code yet. Use "Create missing tracking codes" first.'); return; }
  const name = String(get(row, 'Buyer Name')).trim().split(/\s+/)[0] || 'there';
  const car = String(get(row, 'Car')).trim() || 'your car';
  const base = (SETTINGS.SITE_URL || 'https://YOUR-SITE.netlify.app').replace(/\/$/, '');
  ui.alert('Copy and send this to the buyer',
    'Hi ' + name + ', thank you for your payment for the ' + car + '. ' +
    'Your tracking code is ' + code + '. You can follow every stage and your payments here: ' +
    base + '/track.html?code=' + encodeURIComponent(code), ui.ButtonSet.OK);
}

/* Clears the website cache so edits show immediately */
function clearCache() {
  CacheService.getScriptCache().remove('cars');
  try { SpreadsheetApp.getActive().toast('The website will show your latest cars now.', 'MooEmma Motors', 4); } catch (e) {}
}

/* ---------------- Helpers ---------------- */
// Creates the tab if needed and adds any missing headers at the end (never removes your columns)
function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    .map(h => String(h).trim().toLowerCase());
  const missing = headers.filter(h => existing.indexOf(h.toLowerCase()) === -1);
  if (missing.length) {
    sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
  return sheet;
}

function getter_(headerRow) {
  const col = {};
  headerRow.forEach((h, i) => col[String(h).trim().toLowerCase()] = i);
  return (row, header) => {
    const i = col[header.toLowerCase()];
    return i === undefined ? '' : row[i];
  };
}

function colOf_(sheet, header) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
  return head.indexOf(header.toLowerCase()) + 1;
}

function dropdown_(sheet, header, options) {
  const c = colOf_(sheet, header);
  if (!c) return;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(options, true).setAllowInvalid(false).build();
  sheet.getRange(2, c, 999, 1).setDataValidation(rule);
}

function columnLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// "60/40" -> "60% / 40%", "100" -> "Full payment"
function planText_(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/%|full/i.test(s)) return s;
  const parts = s.split('/').map(x => x.trim()).filter(Boolean);
  return parts.length === 1 && parts[0] === '100' ? 'Full payment' : parts.map(x => x + '%').join(' / ');
}

function newCode_() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O or 1/I to avoid mix-ups
  let s = '';
  for (let i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'MM-' + s.slice(0, 4) + '-' + s.slice(4);
}

function normCode_(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isYes_(v) {
  return v === true || /^(y|yes|true|1)$/i.test(String(v).trim());
}

// Trims text, limits length and stops spreadsheet formulas being injected
function clean_(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
