/* =====================================================================
   SETTINGS: edit these values. Keep this file in the same folder as
   index.html, about.html and track.html.
   ===================================================================== */
window.CONFIG = {
  businessName: 'MooEmma Motors',
  logoUrl: '',            // e.g. 'logo.png' once you add your logo to this folder
  sheetApiUrl: 'https://script.google.com/macros/s/AKfycbzRjxNLMCr89fioD3WNSV7H8cnrd7vUMFGQwaxIdNHinSoKzHUml04idj-Xcdko7XS2/exec',        // paste your Google Apps Script web app URL here
  whatsappNumber: '2349127629802', // international format, no + or spaces
  phoneDisplay: '+234 800 000 0000',
  email: 'hello@mooemmamotors.com',
  city: 'Lagos, Nigeria',
  siteUrl: '',            // optional: your live address, e.g. 'https://mooemmamotors.com'

  // When each instalment is due, by number of instalments in a plan.
  // A plan of 60/40 uses the "2" list: 60% before we buy, 40% when the car arrives.
  paymentSchedule: {
    1: ['Before we buy the car'],
    2: ['Before we buy the car', 'When the car arrives in Nigeria'],
    3: ['Before we buy the car', 'When the car is shipped', 'Before delivery'],
    4: ['Before we buy the car', 'When the car is shipped', 'When the car arrives in Nigeria', 'Before delivery']
  }
};
