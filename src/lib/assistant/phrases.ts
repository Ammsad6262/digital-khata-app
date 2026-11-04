/**
 * Localisation for the Universal Voice Assistant.
 *
 * A tiny, typed phrase table with the two languages the app supports. The
 * assistant must answer in the SELECTED app language, not the language of the
 * words it heard, so every user-facing string goes through this table.
 *
 * Keep this file free of imports from the app's shared i18n dictionary: the
 * Voice Assistant owns its own vocabulary. English strings are the exact
 * wording the assistant used before localisation, so default (English) output
 * stays byte-identical.
 */

export type VoiceLang = "en" | "ur";

export type Phrase = { en: string; ur: string };

/** Accept an untrusted value from a request and fall back to English. */
export function normalizeVoiceLang(value: unknown): VoiceLang {
  return value === "ur" ? "ur" : "en";
}

/** Interpolate {placeholders} in a template. */
export function fill(
  template: string,
  params: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

export const P = {
  // ── Assistant chrome & status ─────────────────────────────────────────
  openAssistant: { en: "Open the Voice Assistant", ur: "وائس اسسٹنٹ کھولیں" },
  voiceAssistant: { en: "Voice Assistant", ur: "وائس اسسٹنٹ" },
  clearConversation: { en: "Clear conversation", ur: "گفتگو صاف کریں" },
  close: { en: "Close", ur: "بند کریں" },

  phaseIdle: { en: "Ready", ur: "تیار" },
  phaseListening: { en: "Listening…", ur: "سن رہا ہوں…" },
  phaseUnderstanding: { en: "Understanding…", ur: "سمجھ رہا ہوں…" },
  phaseExecuting: { en: "Executing…", ur: "عمل درآمد ہو رہا ہے…" },
  phaseConfirm: { en: "Confirm to save", ur: "محفوظ کرنے کے لیے تصدیق کریں" },
  phaseClarify: { en: "Needs clarification", ur: "وضاحت درکار ہے" },
  phaseFailed: { en: "Could not complete", ur: "مکمل نہیں ہو سکا" },
  phaseCompleted: { en: "Completed", ur: "مکمل" },

  // ── Empty state ───────────────────────────────────────────────────────
  emptyTitle: {
    en: "Tap the microphone and speak naturally.",
    ur: "مائیکروفون دبائیں اور قدرتی انداز میں بولیں۔",
  },
  emptyExample1: {
    en: "“Ali bought 20 cartons of rice and paid 15,000”",
    ur: "«علی نے چاول کے 20 کارٹن خریدے اور 15,000 ادا کیے»",
  },
  emptyExample2: {
    en: "“How much does Ali owe?”",
    ur: "«علی پر کتنا واجب الادا ہے؟»",
  },
  emptyExample3: {
    en: "“Received another 5,000 from Ali”",
    ur: "«علی سے مزید 5,000 وصول ہوئے»",
  },
  emptyExample4: {
    en: "“How much rice is left in stock?”",
    ur: "«اسٹاک میں کتنا چاول باقی ہے؟»",
  },
  emptyExample5: {
    en: "“I spent 500 on electricity”",
    ur: "«میں نے بجلی پر 500 خرچ کیے»",
  },
  emptyExample6: {
    en: "“Remind me to call Ali tomorrow”",
    ur: "«مجھے یاد دلائیں کہ کل علی کو فون کرنا ہے»",
  },
  emptyLanguageNote: {
    en: "You can speak Urdu, English, Roman Urdu, or a mix. No language selection is needed.",
    ur: "آپ اردو، انگریزی، رومن اردو یا مخلوط زبان بول سکتے ہیں۔ زبان منتخب کرنے کی ضرورت نہیں۔",
  },

  // ── Conversation UI ───────────────────────────────────────────────────
  youSaid: { en: "You said:", ur: "آپ نے کہا:" },
  iHeard: { en: "I heard · {language}", ur: "میں نے سنا · {language}" },
  lowConfidence: {
    en: "Low confidence — check the words",
    ur: "اعتماد کم ہے — الفاظ چیک کریں",
  },
  correctIfNeeded: { en: "Correct it if needed", ur: "ضرورت ہو تو درست کریں" },
  speechTranscript: { en: "Speech transcript", ur: "گفتگو کا متن" },
  send: { en: "Send", ur: "بھیجیں" },
  reRecord: { en: "Re-record", ur: "دوبارہ ریکارڈ کریں" },
  stopListening: { en: "Stop listening", ur: "سننا بند کریں" },
  startListening: { en: "Start listening", ur: "سننا شروع کریں" },
  listeningTapStop: {
    en: "Listening… tap to stop",
    ur: "سن رہا ہوں… روکنے کے لیے دبائیں",
  },
  tapToSpeak: { en: "Tap to speak", ur: "بولنے کے لیے دبائیں" },
  localTranscriptHint: {
    en: "Your words appear first — nothing is saved until you confirm.",
    ur: "آپ کے الفاظ پہلے دکھائی دیتے ہیں — تصدیق تک کچھ محفوظ نہیں ہوتا۔",
  },
  recordingFallbackHint: {
    en: "This browser cannot transcribe locally, so it sends a short recording.",
    ur: "یہ براؤزر مقامی طور پر متن نہیں بنا سکتا، اس لیے یہ ایک مختصر ریکارڈنگ بھیجتا ہے۔",
  },
  orTypeCommand: { en: "Or type a command…", ur: "یا کمانڈ لکھیں…" },
  sendTypedCommand: { en: "Send typed command", ur: "ٹائپ شدہ کمانڈ بھیجیں" },
  tapNameHint: {
    en: "Tap a name to put it in the box below.",
    ur: "نام نیچے والے خانے میں لانے کے لیے اس پر دبائیں۔",
  },
  tryAgainAfter: {
    en: "Try again after {time}.",
    ur: "{time} کے بعد دوبارہ کوشش کریں۔",
  },
  retry: { en: "Retry", ur: "دوبارہ کوشش" },
  edit: { en: "Edit", ur: "ترمیم" },
  voiceMessage: { en: "🎤 (voice message)", ur: "🎤 (صوتی پیغام)" },
  cancelled: { en: "Cancelled.", ur: "منسوخ کر دیا گیا۔" },
  requestFailed: {
    en: "Request failed ({status}).",
    ur: "درخواست ناکام ہوگئی ({status})۔",
  },
  somethingWentWrong: { en: "Something went wrong.", ur: "کچھ غلط ہو گیا۔" },
  couldNotConfirmStatus: {
    en: "Could not confirm ({status}).",
    ur: "تصدیق نہیں ہو سکی ({status})۔",
  },
  couldNotConfirm: { en: "Could not confirm.", ur: "تصدیق نہیں ہو سکی۔" },
  micErrorGeneric: {
    en: "The microphone could not start. Please try again.",
    ur: "مائیکروفون شروع نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
  },

  // ── Speech recognition ────────────────────────────────────────────────
  speechUnsupported: {
    en: "This browser has no speech recognition.",
    ur: "اس براؤزر میں آواز کی شناخت موجود نہیں۔",
  },
  microphoneDenied: {
    en: "Microphone permission was denied.",
    ur: "مائیکروفون کی اجازت نہیں دی گئی۔",
  },
  heardNothing: { en: "I didn't hear anything.", ur: "مجھے کچھ سنائی نہیں دیا۔" },
  speechFailed: {
    en: "Speech recognition failed.",
    ur: "آواز کی شناخت ناکام ہوگئی۔",
  },
  couldNotStart: { en: "Could not start.", ur: "شروع نہیں ہو سکا۔" },

  // ── Speech language labels ────────────────────────────────────────────
  langEnglish: { en: "English", ur: "انگریزی" },
  langUrdu: { en: "Urdu", ur: "اردو" },
  langRomanUrdu: { en: "Roman Urdu", ur: "رومن اردو" },
  langMixed: { en: "Mixed", ur: "مخلوط" },

  // ── Plan card ─────────────────────────────────────────────────────────
  usingLastCustomer: {
    en: "Using your last customer",
    ur: "آپ کے پچھلے گاہک کو استعمال کیا جا رہا ہے",
  },
  pickGroup: { en: "Pick {group}", ur: "{group} منتخب کریں" },
  groupCustomer: { en: "customer", ur: "گاہک" },
  groupProduct: { en: "product", ur: "مصنوع" },
  groupSupplier: { en: "supplier", ur: "سپلائر" },
  howMuchDidTheyPay: {
    en: "How much did they pay?",
    ur: "انہوں نے کتنا ادا کیا؟",
  },
  fullPayment: { en: "Full payment ({amount})", ur: "پوری ادائیگی ({amount})" },
  onCredit: { en: "On credit", ur: "ادھار پر" },
  orTypeAmount: { en: "Or type an amount", ur: "یا رقم لکھیں" },
  confirm: { en: "Confirm", ur: "تصدیق کریں" },
  cancel: { en: "Cancel", ur: "منسوخ کریں" },

  fieldAmount: { en: "Amount", ur: "رقم" },
  fieldQuantity: { en: "Quantity", ur: "مقدار" },
  fieldPrice: { en: "Price", ur: "قیمت" },
  fieldName: { en: "Name", ur: "نام" },
  fieldUnit: { en: "Unit", ur: "یونٹ" },
  fieldRecordId: { en: "Record ID", ur: "ریکارڈ آئی ڈی" },

  // ── Plan field labels ─────────────────────────────────────────────────
  labelCustomer: { en: "Customer", ur: "گاہک" },
  labelProduct: { en: "Product", ur: "مصنوع" },
  labelQuantity: { en: "Quantity", ur: "مقدار" },
  labelUnitPrice: { en: "Unit price", ur: "فی یونٹ قیمت" },
  labelDiscount: { en: "Discount", ur: "رعایت" },
  labelTotal: { en: "Total", ur: "کل" },
  labelPaidNow: { en: "Paid now", ur: "ابھی ادا شدہ" },
  labelSupplier: { en: "Supplier", ur: "سپلائر" },
  labelAmount: { en: "Amount", ur: "رقم" },
  labelMethod: { en: "Method", ur: "طریقہ" },
  labelExpense: { en: "Expense", ur: "خرچ" },
  labelCategory: { en: "Category", ur: "قسم" },
  labelCostPerUnit: { en: "Cost per unit", ur: "فی یونٹ لاگت" },
  labelSellingPrice: { en: "Selling price", ur: "فروخت کی قیمت" },
  labelPurchasePrice: { en: "Purchase price", ur: "خریداری کی قیمت" },
  labelOpeningStock: { en: "Opening stock", ur: "ابتدائی اسٹاک" },
  labelReminder: { en: "Reminder", ur: "یاد دہانی" },
  labelDue: { en: "Due", ur: "واجب تاریخ" },
  labelPriority: { en: "Priority", ur: "ترجیح" },
  labelTarget: { en: "Target", ur: "ہدف" },
  labelName: { en: "Name", ur: "نام" },
  labelPhone: { en: "Phone", ur: "فون" },
  labelUnit: { en: "Unit", ur: "یونٹ" },
  notStated: { en: "Not stated", ur: "درج نہیں" },
  productCost: { en: "product cost", ur: "مصنوع کی لاگت" },
  unitPiece: { en: "piece", ur: "عدد" },
  methodCash: { en: "cash", ur: "نقد" },
  methodBank: { en: "bank", ur: "بینک" },
  methodCheque: { en: "cheque", ur: "چیک" },
  methodJazzcash: { en: "jazzcash", ur: "جاز کیش" },
  methodEasypaisa: { en: "easypaisa", ur: "ایزی پیسہ" },
  methodOther: { en: "other", ur: "دیگر" },
  categoryTransport: { en: "transport", ur: "ٹرانسپورٹ" },
  categoryElectricity: { en: "electricity", ur: "بجلی" },
  categorySalary: { en: "salary", ur: "تنخواہ" },
  categoryRent: { en: "rent", ur: "کرایہ" },
  categoryPackaging: { en: "packaging", ur: "پیکنگ" },
  categoryShop: { en: "shop", ur: "دکان" },
  categoryOther: { en: "other", ur: "دیگر" },
  priorityNormal: { en: "normal", ur: "عام" },
  priorityHigh: { en: "high", ur: "زیادہ" },
  priorityUrgent: { en: "urgent", ur: "فوری" },
  priorityLow: { en: "low", ur: "کم" },

  // ── Plan summaries ────────────────────────────────────────────────────
  summarySell: {
    en: "Sell {quantity} {unit} {product} to {customer}",
    ur: "{product} کی {quantity} {unit} {customer} کو فروخت کریں",
  },
  summaryPaymentReceived: {
    en: "Record {amount} received from {name}",
    ur: "{name} سے {amount} وصول درج کریں",
  },
  summaryPaySupplier: {
    en: "Pay {amount} to {name}",
    ur: "{name} کو {amount} ادا کریں",
  },
  summaryExpense: {
    en: "Record expense {amount} — {name}",
    ur: "{amount} کا خرچ درج کریں — {name}",
  },
  summaryAddStock: {
    en: "Add {quantity} {unit} of {product} to stock",
    ur: "اسٹاک میں {product} کی {quantity} {unit} شامل کریں",
  },
  summaryBuy: {
    en: "Buy {quantity} {unit} {product} from {supplier}",
    ur: "{supplier} سے {product} کی {quantity} {unit} خریدیں",
  },
  summaryAddCustomer: { en: "Add customer {name}", ur: "گاہک {name} شامل کریں" },
  summaryAddSupplier: { en: "Add supplier {name}", ur: "سپلائر {name} شامل کریں" },
  summaryAddProduct: { en: "Add product {name}", ur: "مصنوع {name} شامل کریں" },
  summaryReminder: { en: "Reminder: {title}", ur: "یاد دہانی: {title}" },
  summaryCompleteReminder: { en: "Complete reminder", ur: "یاد دہانی مکمل کریں" },
  summaryVoidSale: { en: "Void sale", ur: "فروخت منسوخ کریں" },
  summaryVoidExpense: { en: "Void expense", ur: "خرچ منسوخ کریں" },
  summaryVoidPayment: { en: "Void payment", ur: "ادائیگی منسوخ کریں" },
  followUp: { en: "Follow up", ur: "فالو اپ" },
  theCustomer: { en: "the customer", ur: "گاہک" },
  theProduct: { en: "the product", ur: "مصنوع" },
  theSupplier: { en: "the supplier", ur: "سپلائر" },

  // ── Plan warnings ─────────────────────────────────────────────────────
  warnNoCustomerNamed: {
    en: "No customer named “{name}” yet. Pick a customer or add them.",
    ur: "«{name}» نام کا کوئی گاہک نہیں۔ گاہک منتخب کریں یا شامل کریں۔",
  },
  warnNoCustomer: { en: "No customer was mentioned.", ur: "کسی گاہک کا ذکر نہیں ہوا۔" },
  warnNoProductNamed: {
    en: "No product named “{name}” yet.",
    ur: "«{name}» نام کا کوئی مصنوع نہیں۔",
  },
  warnNoProduct: { en: "No product was mentioned.", ur: "کسی مصنوع کا ذکر نہیں ہوا۔" },
  warnNoSupplierNamed: {
    en: "No supplier named “{name}” yet.",
    ur: "«{name}» نام کا کوئی سپلائر نہیں۔",
  },
  warnNoSupplier: { en: "No supplier was mentioned.", ur: "کسی سپلائر کا ذکر نہیں ہوا۔" },
  warnPaidMoreThanTotal: {
    en: "Paid {paid} is more than the sale total {total}.",
    ur: "ادا شدہ {paid} فروخت کے کل {total} سے زیادہ ہے۔",
  },
  warnOversell: {
    en: "Only {current} {unit} of {name} in stock — this sale will oversell.",
    ur: "اسٹاک میں {name} کی صرف {current} {unit} موجود ہے — یہ فروخت اسٹاک سے زیادہ ہو جائے گی۔",
  },
  warnReverse: {
    en: "This reverses money and inventory. Confirm only if you are sure.",
    ur: "یہ رقم اور اسٹاک دونوں واپس کرے گا۔ صرف اسی صورت تصدیق کریں جب آپ کو یقین ہو۔",
  },

  // ── Service errors & clarifications ───────────────────────────────────
  errNotBusinessCommand: {
    en: "I didn't catch a business command. Try “Ali paid 5,000” or “who owes me money?”.",
    ur: "مجھے کوئی کاروباری کمانڈ سمجھ نہیں آئی۔ «علی نے 5,000 ادا کیے» یا «مجھے کون پیسے دینا ہے؟» آزمائیں۔",
  },
  errAiNotSure: {
    en: "I'm not sure what you want to do. Can you say it differently?",
    ur: "مجھے یقین نہیں کہ آپ کیا کرنا چاہتے ہیں۔ کیا آپ دوسرے انداز میں کہہ سکتے ہیں؟",
  },
  errAiSlow: {
    en: "The AI took too long to answer, so I stopped waiting. Your words are saved — tap retry, or use the form below.",
    ur: "جواب دینے میں زیادہ وقت لگا، اس لیے میں نے انتظار روک دیا۔ آپ کے الفاظ محفوظ ہیں — دوبارہ کوشش دبائیں یا نیچے والا فارم استعمال کریں۔",
  },
  errAiExhausted: {
    en: "The AI models have reached today's free limit. Your command is saved — try again after the limit resets (or use the buttons below).",
    ur: "آج کی مفت حد ختم ہو گئی ہے۔ آپ کی کمانڈ محفوظ ہے — حد دوبارہ شروع ہونے کے بعد کوشش کریں (یا نیچے والے بٹن استعمال کریں)۔",
  },
  errAiNotConfigured: {
    en: "The AI is not configured on this server.",
    ur: "اس سرور پر AI ترتیب دیا ہوا نہیں۔",
  },
  errServerUnderstanding: {
    en: "Something went wrong understanding that. Your command was kept — try again.",
    ur: "اسے سمجھنے میں کچھ غلط ہو گیا۔ آپ کی کمانڈ محفوظ ہے — دوبارہ کوشش کریں۔",
  },
  errCouldNotUnderstand: {
    en: "I couldn't understand that one.",
    ur: "میں اسے سمجھ نہیں سکا۔",
  },
  errCantDoThat: { en: "I can't do that yet.", ur: "میں ابھی یہ نہیں کر سکتا۔" },
  alreadySaved: { en: "Already saved: {message}", ur: "یہ پہلے ہی محفوظ ہو چکا ہے۔" },
  alreadyDone: { en: "Already done.", ur: "پہلے ہی مکمل ہے۔" },
  errActionNoLongerExists: {
    en: "That action no longer exists.",
    ur: "وہ کارروائی اب موجود نہیں۔",
  },
  errActionCancelled: { en: "That action was cancelled.", ur: "وہ کارروائی منسوخ ہو چکی ہے۔" },
  errActionProcessing: {
    en: "That action is already being processed.",
    ur: "وہ کارروائی پہلے ہی زیرِ عمل ہے۔",
  },
  pleaseDoubleCheck: {
    en: "{message} (Please double-check this one.)",
    ur: "{message} (براہ کرم اسے ایک بار چیک کریں۔)",
  },
  errActionFailed: { en: "The action failed.", ur: "کارروائی ناکام ہوگئی۔" },

  // ── Action execution ──────────────────────────────────────────────────
  missingField: { en: "The {field} is missing.", ur: "{field} موجود نہیں۔" },
  errQuantityPositive: {
    en: "Quantity must be greater than zero.",
    ur: "مقدار صفر سے زیادہ ہونی چاہیے۔",
  },
  errPriceMissing: { en: "The price is missing.", ur: "قیمت موجود نہیں۔" },
  errPaidAmountRequired: {
    en: "How much did the customer pay? Say the paid amount, or confirm 'on credit'.",
    ur: "گاہک نے کتنا ادا کیا؟ ادا شدہ رقم بتائیں یا 'ادھار پر' کی تصدیق کریں۔",
  },
  errPaidNegative: {
    en: "Paid amount cannot be negative.",
    ur: "ادا شدہ رقم منفی نہیں ہو سکتی۔",
  },
  errPaymentPositive: {
    en: "A payment must be greater than zero.",
    ur: "ادائیگی صفر سے زیادہ ہونی چاہیے۔",
  },
  errExpensePositive: {
    en: "An expense must be greater than zero.",
    ur: "خرچ صفر سے زیادہ ہونا چاہیے۔",
  },
  generalExpense: { en: "General expense", ur: "عمومی خرچ" },
  errSupplierNotFound: { en: "Supplier not found.", ur: "سپلائر نہیں ملا۔" },
  errPaymentOverBalance: {
    en: "Payment is more than the outstanding balance ({amount}).",
    ur: "ادائیگی واجب الادا رقم ({amount}) سے زیادہ ہے۔",
  },
  errSupplierBalanceMismatch: {
    en: "Supplier balance did not match the expected value.",
    ur: "سپلائر کا بیلنس متوقع قدر سے مطابقت نہیں رکھتا۔",
  },
  errStockPositive: {
    en: "Stock quantity must be greater than zero.",
    ur: "اسٹاک کی مقدار صفر سے زیادہ ہونی چاہیے۔",
  },
  errStockMismatch: {
    en: "Stock did not match the expected value.",
    ur: "اسٹاک متوقع قدر سے مطابقت نہیں رکھتا۔",
  },
  errUnsupportedAction: {
    en: "That action is not supported yet.",
    ur: "یہ کارروائی ابھی معاون نہیں ہے۔",
  },
  actionSaleSaved: {
    en: "Sale saved: {total} to {name}. Paid {paid}, balance {balance}.",
    ur: "فروخت محفوظ ہو گئی: {name} کے لیے {total}۔ ادا {paid}، بیلنس {balance}۔",
  },
  actionExpectedBalance: {
    en: "Expected balance {expected}, found {actual}.",
    ur: "متوقع بیلنس {expected}، ملا {actual}۔",
  },
  actionPaymentRecorded: {
    en: "Recorded {amount} from {name}. Balance is now {balance}.",
    ur: "{name} سے {amount} درج ہوئے۔ اب بیلنس {balance} ہے۔",
  },
  actionExpenseSaved: {
    en: "Expense saved: {name} {amount} ({category}).",
    ur: "خرچ محفوظ ہو گیا: {name} {amount} ({category})۔",
  },
  actionCustomerAdded: { en: "Customer {name} added.", ur: "گاہک {name} شامل ہو گیا۔" },
  actionSupplierAdded: { en: "Supplier {name} added.", ur: "سپلائر {name} شامل ہو گیا۔" },
  actionProductAddedStock: {
    en: "Product {name} added with {stock} {unit} opening stock.",
    ur: "مصنوع {name} {stock} {unit} ابتدائی اسٹاک کے ساتھ شامل ہو گیا۔",
  },
  actionProductAdded: { en: "Product {name} added.", ur: "مصنوع {name} شامل ہو گیا۔" },
  actionPurchaseSaved: {
    en: "Purchase saved from {supplier}: {items} item(s), {total} total, {outstanding} on credit. Stock is now {stock} {unit}.",
    ur: "{supplier} سے خریداری محفوظ ہو گئی: {items} آئٹم(ز)، کل {total}، {outstanding} ادھار۔ اب اسٹاک {stock} {unit} ہے۔",
  },
  actionExpectedStock: {
    en: "Expected stock {expected}, found {actual}.",
    ur: "متوقع اسٹاک {expected}، ملا {actual}۔",
  },
  actionSupplierPaid: {
    en: "Paid {amount} to {name}. Balance is now {balance}.",
    ur: "{name} کو {amount} ادا کیے۔ اب بیلنس {balance} ہے۔",
  },
  actionUpdated: { en: "updated", ur: "اپ ڈیٹ شدہ" },
  actionStockAdded: {
    en: "Added {quantity} {unit} of {name}. Stock is now {stock} {unit}.",
    ur: "{name} کی {quantity} {unit} شامل کی گئیں۔ اب اسٹاک {stock} {unit} ہے۔",
  },
  actionReminderSet: { en: "Reminder set: “{title}”.", ur: "یاد دہانی مقرر: «{title}»۔" },
  actionReminderCompleted: {
    en: "Reminder completed: “{title}”.",
    ur: "یاد دہانی مکمل: «{title}»۔",
  },
  actionSaleVoided: {
    en: "Sale voided. Its payments were reversed and stock restored.",
    ur: "فروخت منسوخ ہو گئی۔ اس کی ادائیگیاں واپس اور اسٹاک بحال ہو گیا۔",
  },
  actionExpenseVoided: {
    en: "Expense voided. It will no longer count in reports.",
    ur: "خرچ منسوخ ہو گیا۔ یہ اب رپورٹس میں شمار نہیں ہوگا۔",
  },
  actionPaymentVoided: {
    en: "Payment voided. The customer balance has been restored.",
    ur: "ادائیگی منسوخ ہو گئی۔ گاہک کا بیلنس بحال ہو گیا۔",
  },
  addedByAssistant: { en: "Added by assistant", ur: "اسسٹنٹ کی طرف سے شامل کیا گیا" },

  // ── Query answers ─────────────────────────────────────────────────────
  helpIntro: {
    en: "I can run the whole khata for you. Try:",
    ur: "میں آپ کا پورا کھاتہ چلا سکتا ہوں۔ آزمائیں:",
  },
  help1: {
    en: "• “Ali bought 20 cartons of rice, paid 15,000”",
    ur: "• «علی نے چاول کے 20 کارٹن خریدے، 15,000 ادا کیے»",
  },
  help2: { en: "• “received 5,000 from Ali”", ur: "• «علی سے 5,000 وصول ہوئے»" },
  help3: { en: "• “paid the rice mill 10,000”", ur: "• «چاول مل کو 10,000 ادا کیے»" },
  help4: { en: "• “spent 500 on electricity”", ur: "• «بجلی پر 500 خرچ کیے»" },
  help5: { en: "• “add customer Imran”", ur: "• «گاہک عمران شامل کریں»" },
  help6: { en: "• “add 50 kg rice stock at 900”", ur: "• «50 کلو چاول کا اسٹاک 900 پر شامل کریں»" },
  help7: { en: "• “who owes me money?”", ur: "• «مجھے کون پیسے دینا ہے؟»" },
  help8: { en: "• “how much stock of rice?”", ur: "• «چاول کا کتنا اسٹاک ہے؟»" },
  help9: {
    en: "• “what were my best-selling products this month?”",
    ur: "• «اس مہینے سب سے زیادہ کون سی مصنوعات بکیں؟»",
  },
  help10: { en: "• “remind me to call Ali tomorrow”", ur: "• «مجھے یاد دلائیں کہ کل علی کو فون کرنا ہے»" },

  dashboardToday: {
    en: "Today: sales {sales}, payments {payments}, expenses {expenses}.",
    ur: "آج: فروخت {sales}، ادائیگیاں {payments}، اخراجات {expenses}۔",
  },
  dashboardReceivables: {
    en: "Receivables {amount} from {count} customer(s).",
    ur: "{count} گاہک سے {amount} وصول کرنا ہے۔",
  },
  lowStockCount: {
    en: "{count} product(s) are low on stock.",
    ur: "{count} مصنوعات کا اسٹاک کم ہے۔",
  },
  noLowStock: { en: "No products are low on stock.", ur: "کسی مصنوع کا اسٹاک کم نہیں۔" },
  labelReceivables: { en: "Receivables", ur: "وصول کرنا ہے" },
  labelTodaysSales: { en: "Today's sales", ur: "آج کی فروخت" },
  labelTodaysExpenses: { en: "Today's expenses", ur: "آج کے اخراجات" },
  lowStockItem: { en: "Low stock: {name}", ur: "کم اسٹاک: {name}" },

  customersOweTotal: {
    en: "Customers owe you {amount} in total. {count} customer(s) have an outstanding balance.",
    ur: "گاہک آپ کو کل {amount} دینا ہے۔ {count} گاہک کا بیلنس واجب الادا ہے۔",
  },
  noCustomerOwes: {
    en: "No customer owes you anything right now.",
    ur: "ابھی کوئی گاہک آپ کو کچھ نہیں دیتا۔",
  },

  youOweSuppliers: {
    en: "You owe suppliers {amount}. {count} supplier(s) have a payable balance.",
    ur: "آپ سپلائرز کو {amount} دینا ہے۔ {count} سپلائر کا بیلنس واجب الادا ہے۔",
  },
  noSupplierOwed: {
    en: "You do not owe any supplier right now.",
    ur: "ابھی آپ کسی سپلائر کو کچھ نہیں دیتے۔",
  },

  whichCustomer: { en: "Which customer?", ur: "کون سا گاہک؟" },
  customerOwes: {
    en: "{name} owes you {amount}.",
    ur: "{name} آپ کو {amount} دیتا ہے۔",
  },
  customerAdvance: {
    en: "{name} has an advance of {amount}.",
    ur: "{name} کے پاس {amount} ایڈوانس ہے۔",
  },
  customerSettled: { en: "{name}'s account is settled.", ur: "{name} کا کھاتہ برابر ہے۔" },
  labelTotalSales: { en: "Total sales", ur: "کل فروخت" },
  labelTotalPayments: { en: "Total payments", ur: "کل ادائیگیاں" },

  whoseLedger: { en: "Whose ledger?", ur: "کس کا کھاتہ؟" },
  customerHistory: {
    en: "{name}: balance {balance} across {count} transaction(s).",
    ur: "{name}: {count} لین دین میں بیلنس {balance}۔",
  },
  txSale: { en: "Sale", ur: "فروخت" },
  txPayment: { en: "Payment", ur: "ادائیگی" },
  txAdjustment: { en: "Adjustment", ur: "ایڈجسٹمنٹ" },
  balanceAfter: { en: "balance after: {amount}", ur: "بعد کا بیلنس: {amount}" },

  whichProduct: { en: "Which product?", ur: "کون سی مصنوع؟" },
  stockLevel: {
    en: "{name}: {quantity} in stock{low}. Selling price {price} per {unit}.",
    ur: "{name}: اسٹاک میں {quantity}{low}۔ فروخت کی قیمت {price} فی {unit}۔",
  },
  lowSuffix: { en: " (low)", ur: " (کم)" },
  labelSellingPriceShort: { en: "Selling price", ur: "فروخت کی قیمت" },
  labelPurchasePriceShort: { en: "Purchase price", ur: "خریداری کی قیمت" },

  lowStockProducts: {
    en: "{count} product(s) are low on stock.",
    ur: "{count} مصنوعات کا اسٹاک کم ہے۔",
  },
  noBelowThreshold: {
    en: "No products are below their low-stock threshold.",
    ur: "کوئی مصنوع اپنی کم اسٹاک حد سے نیچے نہیں۔",
  },
  thresholdMeta: { en: "threshold {value}", ur: "حد {value}" },

  bestSelling: {
    en: "Best-selling products in the last {days} days:",
    ur: "پچھلے {days} دنوں کی سب سے زیادہ بکنے والی مصنوعات:",
  },
  noBestSeller: {
    en: "No sales in the last 30 days, so there is no best-seller yet.",
    ur: "پچھلے 30 دنوں میں کوئی فروخت نہیں، اس لیے ابھی کوئی بیسٹ سیلر نہیں۔",
  },
  soldMeta: { en: "{quantity} sold", ur: "{quantity} بکے" },

  salesToday: {
    en: "Today: billed {billed} across {count} sale(s); cash received {cash}.",
    ur: "آج: {count} فروخت میں {billed} بل؛ نقد وصول {cash}۔",
  },
  salesThisMonth: {
    en: "This month: billed {billed} across {count} sale(s); cash received {cash}.",
    ur: "اس مہینے: {count} فروخت میں {billed} بل؛ نقد وصول {cash}۔",
  },
  labelBilled: { en: "Billed", ur: "بل شدہ" },
  labelCashReceived: { en: "Cash received", ur: "نقد وصول" },
  labelDiscounts: { en: "Discounts", ur: "رعایات" },

  expensesToday: {
    en: "Today: expenses {total} across {count} record(s).",
    ur: "آج: {count} اندراج میں {total} اخراجات۔",
  },
  expensesThisMonth: {
    en: "This month: expenses {total} across {count} record(s).",
    ur: "اس مہینے: {count} اندراج میں {total} اخراجات۔",
  },

  profitToday: {
    en: "Today: revenue {revenue}, cost of goods {cogs}, gross profit {gross}, expenses {expenses}, net profit {net} ({margin}% margin).",
    ur: "آج: آمدنی {revenue}، اشیاء کی لاگت {cogs}، مجموعی منافع {gross}، اخراجات {expenses}، خالص منافع {net} ({margin}% مارجن)۔",
  },
  profitAllTime: {
    en: "All time: revenue {revenue}, cost of goods {cogs}, gross profit {gross}, expenses {expenses}, net profit {net} ({margin}% margin).",
    ur: "اب تک: آمدنی {revenue}، اشیاء کی لاگت {cogs}، مجموعی منافع {gross}، اخراجات {expenses}، خالص منافع {net} ({margin}% مارجن)۔",
  },
  profitThisMonth: {
    en: "This month: revenue {revenue}, cost of goods {cogs}, gross profit {gross}, expenses {expenses}, net profit {net} ({margin}% margin).",
    ur: "اس مہینے: آمدنی {revenue}، اشیاء کی لاگت {cogs}، مجموعی منافع {gross}، اخراجات {expenses}، خالص منافع {net} ({margin}% مارجن)۔",
  },
  labelRevenue: { en: "Revenue", ur: "آمدنی" },
  labelCogs: { en: "Cost of goods sold", ur: "بکی ہوئی اشیاء کی لاگت" },
  labelGrossProfit: { en: "Gross profit", ur: "مجموعی منافع" },
  labelExpenses: { en: "Expenses", ur: "اخراجات" },
  labelNetProfit: { en: "Net profit", ur: "خالص منافع" },

  recentSales: { en: "Most recent sales:", ur: "حالیہ فروخت:" },
  noSales: { en: "No sales recorded yet.", ur: "ابھی کوئی فروخت درج نہیں۔" },
  due: { en: "due {amount}", ur: "واجب {amount}" },
  paid: { en: "paid", ur: "ادا شدہ" },
  recentExpenses: { en: "Most recent expenses:", ur: "حالیہ اخراجات:" },
  noExpenses: { en: "No expenses recorded yet.", ur: "ابھی کوئی خرچ درج نہیں۔" },
  recentPurchases: { en: "Most recent purchases:", ur: "حالیہ خریداری:" },
  noPurchases: { en: "No purchases recorded yet.", ur: "ابھی کوئی خریداری درج نہیں۔" },

  whichSupplier: { en: "Which supplier?", ur: "کون سا سپلائر؟" },
  youOweSupplier: {
    en: "You owe {name} {amount}.",
    ur: "آپ {name} کو {amount} دیتے ہیں۔",
  },
  supplierAdvance: {
    en: "{name} has an advance of {amount}.",
    ur: "{name} کے پاس {amount} ایڈوانس ہے۔",
  },
  supplierSettled: { en: "{name}'s account is settled.", ur: "{name} کا کھاتہ برابر ہے۔" },
  labelTotalPurchases: { en: "Total purchases", ur: "کل خریداری" },
  recentPurchasesFrom: {
    en: "Recent purchases from {name}:",
    ur: "{name} سے حالیہ خریداری:",
  },
  noPurchasesFrom: {
    en: "No purchases recorded from {name}.",
    ur: "{name} سے کوئی خریداری درج نہیں۔",
  },

  remindersDueToday: {
    en: "{count} reminder(s) due today.",
    ur: "آج {count} یاد دہانیاں واجب ہیں۔",
  },
  nothingDueToday: { en: "Nothing is due today.", ur: "آج کچھ واجب نہیں۔" },
  openReminders: { en: "{count} open reminder(s).", ur: "{count} کھلی یاد دہانیاں۔" },
  noOpenReminders: { en: "No open reminders.", ur: "کوئی کھلی یاد دہانی نہیں۔" },

  inactiveCustomers: {
    en: "{count} customer(s) have not purchased recently.",
    ur: "{count} گاہکوں نے حال ہی میں خریداری نہیں کی۔",
  },
  everyCustomerRecent: {
    en: "Every customer has purchased recently.",
    ur: "ہر گاہک نے حال ہی میں خریداری کی ہے۔",
  },
  noPurchasesYet: { en: "no purchases yet", ur: "ابھی کوئی خریداری نہیں" },
  daysInactive: { en: "{count} days inactive", ur: "{count} دن سے غیر فعال" },

  reorderCandidates: {
    en: "{count} customer(s) may be ready to order again.",
    ur: "{count} گاہک دوبارہ آرڈر کے لیے تیار ہو سکتے ہیں۔",
  },
  noReorderCandidates: {
    en: "No reorder candidates right now.",
    ur: "ابھی دوبارہ آرڈر کے کوئی امیدوار نہیں۔",
  },
  oldestDue: { en: "oldest due {date}", ur: "سب سے پرانی واجب تاریخ {date}" },

  overdueCustomers: {
    en: "{customers} customer(s) are past their due date, owing {amount} across {sales} sale(s).",
    ur: "{customers} گاہکوں کی واجب تاریخ گزر چکی ہے، {sales} فروخت میں {amount} واجب الادا ہے۔",
  },
  noOverdue: { en: "No customer payment is overdue.", ur: "کسی گاہک کی ادائیگی زائد المیعاد نہیں۔" },

  customerCount: { en: "{count} customer(s).", ur: "{count} گاہک۔" },
  productCount: { en: "{count} product(s).", ur: "{count} مصنوعات۔" },
  supplierCount: { en: "{count} supplier(s).", ur: "{count} سپلائر۔" },
  noAnswer: {
    en: "I do not have an answer for that yet.",
    ur: "میرے پاس ابھی اس کا جواب نہیں۔",
  },

  // ── API validation ────────────────────────────────────────────────────
  errRateLimited: {
    en: "Too many assistant requests. Try again in {seconds}s.",
    ur: "اسسٹنٹ کی بہت زیادہ درخواستیں۔ {seconds} سیکنڈ بعد دوبارہ کوشش کریں۔",
  },
  errBodyRequired: {
    en: "A request body is required.",
    ur: "درخواست کا باڈی درکار ہے۔",
  },
  errCommandTooLong: {
    en: "Command is too long (max {max} characters).",
    ur: "کمانڈ بہت طویل ہے (زیادہ سے زیادہ {max} حروف)۔",
  },
  errRecordingTooLarge: {
    en: "Recording is too large (max 5 MB).",
    ur: "ریکارڈنگ بہت بڑی ہے (زیادہ سے زیادہ 5 MB)۔",
  },
  errSayOrType: { en: "Say or type a command.", ur: "کوئی کمانڈ بولیں یا لکھیں۔" },
  errActionIdRequired: { en: "actionId is required.", ur: "actionId درکار ہے۔" },
} as const satisfies Record<string, Phrase>;

export type VoicePhraseKey = keyof typeof P;

/** Pick the phrase for the selected app language and fill its placeholders. */
export function pickVoice(
  lang: VoiceLang,
  key: VoicePhraseKey,
  params: Record<string, string | number> = {},
): string {
  return fill(P[key][lang] ?? P[key].en, params);
}

const METHOD_KEYS: Record<string, VoicePhraseKey> = {
  cash: "methodCash",
  bank: "methodBank",
  cheque: "methodCheque",
  jazzcash: "methodJazzcash",
  easypaisa: "methodEasypaisa",
  other: "methodOther",
};

/** Localise a payment method stored as an enum value. */
export function methodLabel(lang: VoiceLang, method: string | null | undefined): string {
  const key = method ? METHOD_KEYS[method] : "methodCash";
  return pickVoice(lang, key ?? "methodOther");
}

const CATEGORY_KEYS: Record<string, VoicePhraseKey> = {
  transport: "categoryTransport",
  electricity: "categoryElectricity",
  salary: "categorySalary",
  rent: "categoryRent",
  packaging: "categoryPackaging",
  shop: "categoryShop",
  other: "categoryOther",
};

/** Localise a known expense category; user-entered categories pass through. */
export function categoryLabel(lang: VoiceLang, category: string | null | undefined): string {
  const key = category ? CATEGORY_KEYS[category] : "categoryOther";
  return key ? pickVoice(lang, key) : (category ?? "");
}

const PRIORITY_KEYS: Record<string, VoicePhraseKey> = {
  normal: "priorityNormal",
  high: "priorityHigh",
  urgent: "priorityUrgent",
  low: "priorityLow",
};

/** Localise a stored reminder priority. */
export function priorityLabel(lang: VoiceLang, priority: string | null | undefined): string {
  const key = priority ? PRIORITY_KEYS[priority] : "priorityNormal";
  return key ? pickVoice(lang, key) : (priority ?? "");
}

/** Localise the fixed "piece" unit; user-entered units pass through. */
export function unitLabel(lang: VoiceLang, unit: string | null | undefined): string {
  return unit === "piece" ? pickVoice(lang, "unitPiece") : (unit ?? "");
}