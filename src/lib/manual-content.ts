export type ManualSection = {
  id: string;
  title: string;
  intro?: string;
  steps?: string[];
  tips?: string[];
};

export const manualBenefits: string[] = [
  "Sell faster at the counter with a touch-friendly Point of Sale and barcode scanning.",
  "Every sale, payment and expense is recorded automatically — no more lost notebooks.",
  "Professional invoices, quotations and receipts with your own logo and brand colour.",
  "Know your real profit: sales, cost of goods and expenses are compared for you.",
  "Stock is reduced automatically on each sale, and you are warned before items run out.",
  "Sell online too: your own store page with a shareable link and WhatsApp ordering.",
  "Add your staff with limited access, so they can sell without seeing your figures.",
  "Works on phone, tablet and computer, and can be installed like a normal app.",
];

export const manualSections: ManualSection[] = [
  {
    id: "getting-started",
    title: "1. Getting started",
    intro:
      "Everything begins with your business account. Once your business is approved you get your own private workspace — no other business can see your data.",
    steps: [
      "Create an account with your email, or sign in with Google.",
      "Register your business: name, phone, address and the plan you want.",
      "Wait for approval. The page shows 'Awaiting approval' until the administrator activates you.",
      "Once approved, click 'Go to dashboard' to enter your workspace.",
      "Open Settings and fill in your business details, logo, brand colour and currency (Uganda Shillings by default).",
    ],
    tips: [
      "Upload a clear square logo — it appears on invoices, receipts and reports.",
      "One account belongs to one business. Staff get their own logins from Users & access.",
    ],
  },
  {
    id: "dashboard",
    title: "2. The dashboard",
    intro:
      "The dashboard is your daily summary: money in, money out and how the business is performing.",
    steps: [
      "Choose a period at the top: Day, Week, Month or a custom date range.",
      "Read the cards: total sales, payments received, outstanding balance and expenses.",
      "Scroll to Profit and Loss to see, in plain language, where your money went.",
      "Follow the message card — it congratulates you on profit or warns you when sales drop.",
    ],
    tips: ["Check the dashboard every morning with the 'Day' filter to see yesterday's performance."],
  },
  {
    id: "products",
    title: "3. Products and stock",
    intro: "Products are the items you sell. Good product records make selling and reporting accurate.",
    steps: [
      "Open Products and click Add product.",
      "Enter the name, selling price and cost price (cost price is what you paid — it is used to calculate profit).",
      "Choose a category and supplier from the drop-downs, or add new ones in their cards.",
      "Enter the stock quantity and the low-stock alert level.",
      "Scan or type the barcode / SKU so the item can be found instantly at the counter.",
      "Upload up to 3 photos — these show in your online store.",
    ],
    tips: [
      "Set a realistic low-stock level; the system notifies you before you run out.",
      "The system refuses to sell an item that has no stock, both at the counter and online.",
    ],
  },
  {
    id: "customers",
    title: "4. Customers",
    intro: "Keep a record of who buys from you so you can follow up on balances.",
    steps: [
      "Open Customers and click Add customer.",
      "Fill in the name, phone, email and address (only the name is required).",
      "Each customer gets a short shop code such as Jo123 — share it on WhatsApp so returning customers order faster online.",
      "Open a customer to see their invoices and balance.",
    ],
  },
  {
    id: "pos",
    title: "5. Point of Sale (selling at the counter)",
    intro: "The POS screen is built for speed — scan, tap, take payment, print.",
    steps: [
      "Click POS at the top of the screen or in the sidebar.",
      "Scan the barcode with the camera scanner, or search and tap the product.",
      "Adjust quantities in the cart on the right; the total updates instantly.",
      "Attach a customer if you need the sale on their record (optional for walk-ins).",
      "Choose the payment method and complete the sale — cash sales must be paid in full.",
      "Print or download the receipt: A4, 80mm or 58mm thermal.",
    ],
    tips: [
      "Hold the phone steady and tap the screen to refocus if a faint barcode does not read.",
      "A beep and short vibration confirm a successful scan.",
    ],
  },
  {
    id: "invoices",
    title: "6. Quotations, invoices and receipts",
    intro: "Use invoices for credit sales and quotations for price offers.",
    steps: [
      "Open Invoices and click New invoice.",
      "Pick the customer, then add line items (on a phone, swipe the line items sideways).",
      "Set tax, discount and due date, then save as Draft or issue it.",
      "Drafts can be edited later with the Edit button; issued invoices are locked for safety.",
      "Record a payment on the invoice — a receipt is created automatically.",
      "Download or print the PDF, and send it to the customer on WhatsApp or email.",
    ],
    tips: ["Choose your document template and brand colour in Settings so every document looks the same."],
  },
  {
    id: "payments-expenses",
    title: "7. Payments and expenses",
    intro: "Record every shilling that comes in and goes out to see the true picture.",
    steps: [
      "Payments lists all money received, by method and date.",
      "Open Expenses and click Add expense for rent, transport, salaries, airtime and so on.",
      "For repeating costs, set the expense as recurring — daily, weekly or monthly — and it is recorded automatically.",
    ],
    tips: ["Record expenses the same day. Missing expenses make your profit look bigger than it really is."],
  },
  {
    id: "reports",
    title: "8. Reports",
    intro: "Reports turn your daily work into decisions, and every table can be downloaded.",
    steps: [
      "Sales report: totals per day, week, month or selected dates.",
      "Sales record: one row per sale with the customer name, status, total, paid and balance.",
      "Profit and Loss: sales, cost of goods, expenses and the profit left, explained in simple words.",
      "Audit: a trail of invoices, payments, expenses and stock changes.",
      "Use the date filters or quick ranges, then export as PDF (A4 landscape) or CSV for Excel.",
    ],
  },
  {
    id: "store",
    title: "9. Online store",
    intro: "If your plan includes the store module, you get a public shop page for your business.",
    steps: [
      "Open Online store, switch it on and choose which products appear.",
      "Share your store link with customers on WhatsApp, Facebook or your status.",
      "Customers browse photos, add to cart and check out.",
      "Returning customers only enter their 5-character shop code — no forms again.",
      "Orders arrive as quotations, and the message opens on your WhatsApp ready to send.",
    ],
  },
  {
    id: "team",
    title: "10. Users and access",
    intro: "Add your staff so they can work without seeing everything.",
    steps: [
      "Open Users & access and click Add user.",
      "Enter their name and email; they receive a temporary password.",
      "The default role sells at the counter only — no dashboard, no reports.",
      "Give a bigger role (manager, accountant, store manager) only when needed.",
      "Switch a user off any time when they leave.",
    ],
    tips: ["Never share the owner login. Give each person their own account so you know who sold what."],
  },
  {
    id: "billing",
    title: "11. Plan and billing",
    intro: "Your plan controls limits such as products, invoices and extra modules.",
    steps: [
      "Open Billing & Plan to see your current plan, limits and expiry date.",
      "Click Switch plan to request a different package.",
      "The request goes to the administrator; your account shows 'pending' until it is approved.",
      "Once approved, the new plan and its features apply immediately.",
    ],
    tips: ["Renew before the expiry date — an expired plan blocks new sales and invoices."],
  },
  {
    id: "notifications",
    title: "12. Notifications and installing the app",
    steps: [
      "The bell at the top shows new alerts: low stock, overdue invoices, plan expiry and approvals.",
      "Open Notifications to filter them and click an item to jump straight to the record.",
      "Click 'Install app' in the top bar to add Softtrack Pos to your phone or desktop home screen.",
    ],
  },
];

export const manualTips: string[] = [
  "Set cost prices on every product — without them the profit figures are not reliable.",
  "Close each day by checking Reports > Sales record against the money in your drawer.",
  "Do a stock count weekly and correct quantities in Products.",
  "Use the customer shop code so repeat buyers order in seconds.",
  "Download your reports monthly and keep them as your business records.",
  "Log out on shared devices, and give each staff member their own login.",
];

export const manualFaq: { q: string; a: string }[] = [
  { q: "I cannot sell — it says permission denied.", a: "Your role may be limited or your plan has expired. Ask the owner to check Users & access and Billing & Plan." },
  { q: "My logo does not appear on documents.", a: "Open Settings and upload the logo again using the upload button, then reload the page." },
  { q: "A product cannot be added to the cart.", a: "Its stock is zero. Add stock in Products first." },
  { q: "The PDF did not download on my phone.", a: "Choose 'Save to Files' or your Downloads folder when the share sheet appears." },
];
