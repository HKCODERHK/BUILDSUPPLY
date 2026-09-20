// Hindi and Marathi for the screens a supplier touches every day.
//
// The wording deliberately uses the words the trade actually uses rather than
// formal dictionary translations — बिल, स्टॉक, रेट, पेमेंट, कोटेशन are what a
// supplier says out loud, so translating them to शुद्ध Hindi would make the
// app harder to read, not easier. "माल" is used for materials and "बाकी" for
// pending, straight out of khata language.
//
// Admin-only screens stay in English: the admin is the platform owner, not a
// supplier, and they read English.

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिंदी', short: 'हिं' },
  { code: 'mr', label: 'मराठी', short: 'मरा' },
] as const

export type Lang = (typeof LANGUAGES)[number]['code']

interface Entry {
  en: string
  hi: string
  mr: string
}

const STRINGS = {
  // ── Navigation ────────────────────────────────────────────────────────
  'nav.dashboard': { en: 'Dashboard', hi: 'डैशबोर्ड', mr: 'डॅशबोर्ड' },
  'nav.customers': { en: 'Customers', hi: 'ग्राहक', mr: 'ग्राहक' },
  'nav.materials': { en: 'Stock', hi: 'स्टॉक', mr: 'स्टॉक' },
  'nav.invoices': { en: 'Invoices', hi: 'बिल', mr: 'बिल' },
  'nav.quotations': { en: 'Quotations', hi: 'कोटेशन', mr: 'कोटेशन' },
  'nav.payments': { en: 'Payments', hi: 'पेमेंट', mr: 'पेमेंट' },
  'nav.deliveries': { en: 'Deliveries', hi: 'डिलीवरी', mr: 'डिलिव्हरी' },
  'nav.reminders': { en: 'Reminders', hi: 'रिमाइंडर', mr: 'रिमाइंडर' },
  'nav.reports': { en: 'Reports', hi: 'रिपोर्ट', mr: 'रिपोर्ट' },
  'nav.settings': { en: 'Settings', hi: 'सेटिंग', mr: 'सेटिंग' },
  'nav.more': { en: 'More', hi: 'और', mr: 'आणखी' },
  // The last tab: the business's logo, opening its profile and settings.
  'nav.profile': { en: 'Profile', hi: 'प्रोफ़ाइल', mr: 'प्रोफाइल' },
  'nav.signOut': { en: 'Sign out', hi: 'लॉग आउट', mr: 'लॉग आउट' },

  // ── Common words ──────────────────────────────────────────────────────
  'common.save': { en: 'Save', hi: 'सेव करें', mr: 'सेव करा' },
  'common.saving': { en: 'Saving…', hi: 'सेव हो रहा है…', mr: 'सेव होत आहे…' },
  'common.cancel': { en: 'Cancel', hi: 'रद्द करें', mr: 'रद्द करा' },
  'common.loading': { en: 'Loading…', hi: 'लोड हो रहा है…', mr: 'लोड होत आहे…' },
  'common.search': { en: 'Search', hi: 'खोजें', mr: 'शोधा' },
  'common.add': { en: 'Add', hi: 'जोड़ें', mr: 'जोडा' },
  'common.edit': { en: 'Edit', hi: 'बदलें', mr: 'बदला' },
  'common.done': { en: 'Done', hi: 'हो गया', mr: 'झाले' },
  'common.close': { en: 'Close', hi: 'बंद करें', mr: 'बंद करा' },
  'common.viewAll': { en: 'View all', hi: 'सब देखें', mr: 'सर्व पहा' },
  'common.total': { en: 'Total', hi: 'कुल', mr: 'एकूण' },
  'common.pending': { en: 'Pending', hi: 'बाकी', mr: 'बाकी' },
  'common.paid': { en: 'Paid', hi: 'जमा', mr: 'जमा' },
  'common.amount': { en: 'Amount', hi: 'रकम', mr: 'रक्कम' },
  'common.name': { en: 'Name', hi: 'नाम', mr: 'नाव' },
  'common.phone': { en: 'Phone', hi: 'फ़ोन', mr: 'फोन' },
  'common.address': { en: 'Address', hi: 'पता', mr: 'पत्ता' },
  'common.site': { en: 'Site', hi: 'साइट', mr: 'साईट' },
  'common.status': { en: 'Status', hi: 'स्थिति', mr: 'स्थिती' },
  'common.qty': { en: 'Qty', hi: 'मात्रा', mr: 'प्रमाण' },
  'common.rate': { en: 'Rate', hi: 'रेट', mr: 'रेट' },
  'common.mode': { en: 'Mode', hi: 'तरीका', mr: 'पद्धत' },
  'common.stock': { en: 'Stock', hi: 'स्टॉक', mr: 'स्टॉक' },
  'common.customer': { en: 'Customer', hi: 'ग्राहक', mr: 'ग्राहक' },
  'common.none': { en: 'No', hi: 'नहीं', mr: 'नाही' },
  'common.yes': { en: 'Yes', hi: 'हाँ', mr: 'होय' },
  'common.sendWhatsApp': { en: 'Send on WhatsApp', hi: 'व्हाट्सएप पर भेजें', mr: 'व्हॉट्सॲपवर पाठवा' },
  'common.preparing': { en: 'Preparing…', hi: 'तैयार हो रहा है…', mr: 'तयार होत आहे…' },

  // ── Sending a PDF on WhatsApp (shareDocument.ts) ─────────────────────
  'share.readyTitle': { en: 'Your PDF is ready', hi: 'PDF तैयार है', mr: 'PDF तयार आहे' },
  'share.readyBody': {
    en: 'Tap below, choose WhatsApp, then pick the customer and press Send.',
    hi: 'नीचे दबाएँ, व्हाट्सएप चुनें, फिर ग्राहक चुनकर भेजें दबाएँ।',
    mr: 'खाली दाबा, व्हॉट्सॲप निवडा, मग ग्राहक निवडून पाठवा दाबा.',
  },
  'share.unsupportedTitle': { en: "Can't attach the PDF here", hi: 'यहाँ PDF नहीं भेज सकते', mr: 'इथे PDF पाठवता येत नाही' },
  'share.unsupportedBody': {
    en: "This browser can't hand a PDF to WhatsApp. Open BuildSupply on your phone and send it from there.",
    hi: 'यह ब्राउज़र PDF को व्हाट्सएप पर नहीं भेज सकता। फ़ोन पर BuildSupply खोलकर वहाँ से भेजें।',
    mr: 'हा ब्राउझर PDF व्हॉट्सॲपला देऊ शकत नाही. फोनवर BuildSupply उघडून तिथून पाठवा.',
  },
  'share.understood': { en: 'OK', hi: 'ठीक है', mr: 'ठीक आहे' },

  // ── Advances and opening balances (migration 024) ────────────────────
  'pay.advance': { en: 'Advance', hi: 'एडवांस', mr: 'ॲडव्हान्स' },
  'pay.nBills': { en: '{n} bills', hi: '{n} बिल', mr: '{n} बिले' },
  'pay.keptAsAdvance': {
    en: '{amount} more than they owed — kept as advance for their next bill.',
    hi: '{amount} बाकी से ज़्यादा था — अगले बिल के लिए एडवांस रखा गया।',
    mr: '{amount} बाकीपेक्षा जास्त होते — पुढच्या बिलासाठी ॲडव्हान्स ठेवले.',
  },
  'pay.receiptAdvance': { en: 'Advance with us: {amount}.', hi: 'हमारे पास एडवांस: {amount}।', mr: 'आमच्याकडे ॲडव्हान्स: {amount}.' },
  // "Receive advance" — the customer page's button while nothing is owed.
  'cust.receiveAdvance': { en: 'Receive advance', hi: 'एडवांस लें', mr: 'ॲडव्हान्स घ्या' },
  // The customer page's Ledger quick action and its WhatsApp icon.
  'cust.ledger': { en: 'Ledger', hi: 'खाता', mr: 'खाते' },
  'cust.call': { en: 'Call', hi: 'कॉल करें', mr: 'कॉल करा' },
  'cust.callName': { en: 'Call {name}', hi: '{name} को कॉल करें', mr: '{name} यांना कॉल करा' },
  'cust.ledgerShare': { en: 'Send ledger on WhatsApp', hi: 'खाता व्हाट्सएप पर भेजें', mr: 'खाते व्हॉट्सॲपवर पाठवा' },
  'pay.recordAdvance': { en: 'Record advance', hi: 'एडवांस दर्ज करें', mr: 'ॲडव्हान्स नोंदवा' },
  'pay.advanceIntro': {
    en: 'Nothing is owed right now. This is kept as their advance, and their next bill uses it automatically.',
    hi: 'अभी कुछ बाकी नहीं है। यह रकम इनके एडवांस में रहेगी, और अगले बिल में अपने-आप लग जाएगी।',
    mr: 'आत्ता काही बाकी नाही. ही रक्कम यांच्या ॲडव्हान्समध्ये राहील, आणि पुढच्या बिलात आपोआप वापरली जाईल.',
  },
  'pay.advanceIntroHeld': {
    en: 'Nothing is owed right now, and they already hold {amount} advance. This adds to it; their next bill uses it automatically.',
    hi: 'अभी कुछ बाकी नहीं है, और इनके पास पहले से {amount} एडवांस है। यह रकम उसमें जुड़ेगी; अगले बिल में अपने-आप लग जाएगी।',
    mr: 'आत्ता काही बाकी नाही, आणि यांच्याकडे आधीच {amount} ॲडव्हान्स आहे. ही रक्कम त्यात जमा होईल; पुढच्या बिलात आपोआप वापरली जाईल.',
  },
  'pay.advanceIntroOwed': {
    en: 'This is kept apart as advance for their next bill. It is not used on the {amount} they already owe.',
    hi: 'यह रकम अगले बिल के एडवांस के रूप में अलग रहेगी। पहले से बाकी {amount} में नहीं लगेगी।',
    mr: 'ही रक्कम पुढच्या बिलासाठी ॲडव्हान्स म्हणून वेगळी राहील. आधीच्या {amount} बाकीत वापरली जाणार नाही.',
  },
  'pay.advanceReceived': { en: '{amount} advance received', hi: '{amount} एडवांस मिला', mr: '{amount} ॲडव्हान्स मिळाला' },
  'pay.advanceHeldNow': {
    en: 'Advance with you now: {amount}. Their next bill uses it automatically.',
    hi: 'अब आपके पास एडवांस: {amount}। अगले बिल में यह अपने-आप लग जाएगा।',
    mr: 'आता तुमच्याकडे ॲडव्हान्स: {amount}. पुढच्या बिलात तो आपोआप वापरला जाईल.',
  },
  'cust.advanceAmount': { en: 'Advance {amount}', hi: 'एडवांस {amount}', mr: 'ॲडव्हान्स {amount}' },
  'cust.openingBalance': { en: 'Opening balance', hi: 'पुराना बाकी', mr: 'जुनी बाकी' },
  'cust.openingField': { en: 'Old balance (udhaar)', hi: 'पुराना बाकी (उधार)', mr: 'जुनी बाकी (उधार)' },
  'cust.openingHint': {
    en: 'What they already owed before BuildSupply. It counts in their khata and is cleared first, but not in your sales.',
    hi: 'BuildSupply से पहले का बाकी। यह खाते में जुड़ता है और सबसे पहले चुकता होता है, पर बिक्री में नहीं गिना जाता।',
    mr: 'BuildSupply आधीची बाकी. ही खात्यात जमा होते आणि आधी फिटते, पण विक्रीत मोजली जात नाही.',
  },
  'cust.openingRetry': {
    en: "The customer is saved, but the old balance wasn't. Tap Save again to add it.",
    hi: 'ग्राहक सेव हो गया, पर पुराना बाकी नहीं जुड़ा। जोड़ने के लिए फिर से सेव दबाएँ।',
    mr: 'ग्राहक सेव झाला, पण जुनी बाकी जोडली नाही. जोडण्यासाठी पुन्हा सेव दाबा.',
  },
  'inv.advanceWillApply': {
    en: 'Their advance of {amount} will be used on this bill.',
    hi: 'इनका {amount} एडवांस इस बिल में लग जाएगा।',
    mr: 'यांचा {amount} ॲडव्हान्स या बिलात वापरला जाईल.',
  },
  'inv.paidMoreGoesToAdvance': {
    en: 'That is more than this bill. The extra {amount} clears their older bills first, then is kept as advance.',
    hi: 'यह बिल से ज़्यादा है। बाकी {amount} पहले पुराने बिलों में लगेगा, फिर एडवांस में रहेगा।',
    mr: 'हे बिलापेक्षा जास्त आहे. उरलेले {amount} आधी जुन्या बिलांना लागेल, मग ॲडव्हान्स म्हणून राहील.',
  },
  'inv.cancelPaymentKept': {
    en: 'The {amount} paid on it stays with {customer} as advance — their other unpaid bills use it first.',
    hi: 'इस पर मिले {amount} {customer} के एडवांस में रहेंगे — पहले उनके बाकी बिलों में लगेंगे।',
    mr: 'यावर मिळालेले {amount} {customer} यांच्या ॲडव्हान्समध्ये राहतील — आधी त्यांच्या बाकी बिलांना लागतील.',
  },
  'pin.reasonOpeningBalance': { en: 'Change an opening balance', hi: 'पुराना बाकी बदलना', mr: 'जुनी बाकी बदलणे' },

  // ── Invoice status ────────────────────────────────────────────────────
  'status.Unpaid': { en: 'Unpaid', hi: 'बाकी', mr: 'बाकी' },
  'status.Partial': { en: 'Partial', hi: 'कुछ जमा', mr: 'काही जमा' },
  'status.Paid': { en: 'Paid', hi: 'पूरा जमा', mr: 'पूर्ण जमा' },
  'status.Cancelled': { en: 'Cancelled', hi: 'रद्द', mr: 'रद्द' },
  'status.Active': { en: 'Active', hi: 'चालू', mr: 'चालू' },
  'status.Inactive': { en: 'Inactive', hi: 'बंद', mr: 'बंद' },

  // ── Overdue ───────────────────────────────────────────────────────────
  'overdue.days': { en: 'pending {days} days', hi: '{days} दिन से बाकी', mr: '{days} दिवसांपासून बाकी' },
  'overdue.oneDay': { en: 'pending 1 day', hi: '1 दिन से बाकी', mr: '1 दिवसापासून बाकी' },
  'overdue.today': { en: 'pending since today', hi: 'आज से बाकी', mr: 'आजपासून बाकी' },
  'overdue.oldest': { en: 'Oldest pending', hi: 'सबसे पुराना बाकी', mr: 'सर्वात जुने बाकी' },

  // ── Brand ─────────────────────────────────────────────────────────────
  // Sits under the wordmark in the sidebar and the phone's top bar. "BuildSupply"
  // itself is the name and stays as it is in every language.
  'brand.tagline': {
    en: 'Building Materials. Business Made Easy.',
    hi: 'बिल्डिंग मटेरियल. बिज़नेस आसान.',
    mr: 'बांधकाम साहित्य. व्यवसाय सोपा.',
  },

  // ── Splash ────────────────────────────────────────────────────────────
  'splash.launch': {
    en: 'Loading your trusted building supply partner…',
    hi: 'आपका भरोसेमंद बिल्डिंग सप्लाई पार्टनर खुल रहा है…',
    mr: 'तुमचा विश्वासू बिल्डिंग सप्लाय पार्टनर उघडत आहे…',
  },
  'splash.signin': {
    en: 'Preparing your dashboard…',
    hi: 'आपका डैशबोर्ड तैयार हो रहा है…',
    mr: 'तुमचा डॅशबोर्ड तयार होत आहे…',
  },
  'splash.cement': { en: 'Cement', hi: 'सीमेंट', mr: 'सिमेंट' },
  'splash.steel': { en: 'Steel', hi: 'सरिया', mr: 'सळई' },
  'splash.bricks': { en: 'Bricks', hi: 'ईंट', mr: 'वीट' },
  'splash.delivery': { en: 'Delivery', hi: 'डिलीवरी', mr: 'डिलिव्हरी' },
  'splash.trusted': { en: 'Trusted', hi: 'भरोसेमंद', mr: 'विश्वासू' },
  // The splash story's caption (SplashStory), lit a word at a time. "Site",
  // not "Construction": it is the trade's own word, and the long one pushed
  // the five-word line past a 360px phone.
  'story.site': { en: 'Site', hi: 'साइट', mr: 'साइट' },
  'story.materials': { en: 'Materials', hi: 'माल', mr: 'माल' },
  'story.delivery': { en: 'Delivery', hi: 'डिलीवरी', mr: 'डिलिव्हरी' },
  'story.bill': { en: 'Bill', hi: 'बिल', mr: 'बिल' },
  'story.payment': { en: 'Payment', hi: 'पेमेंट', mr: 'पेमेंट' },

  // ── Dashboard ─────────────────────────────────────────────────────────
  'dash.welcome': { en: 'Welcome back, {name}', hi: 'नमस्ते, {name}', mr: 'नमस्कार, {name}' },
  'dash.subtitle': {
    en: "Here's how your business is doing.",
    hi: 'आपका कारोबार कैसा चल रहा है।',
    mr: 'तुमचा व्यवसाय कसा चालू आहे.',
  },
  // Before the first bill. "Welcome back" is wrong on a first login, and
  // "how your business is doing" sits badly over a card of steps. Hindi and
  // Marathi were already neutral greetings, so only English changes.
  'dash.welcomeNew': { en: 'Welcome, {name}', hi: 'नमस्ते, {name}', mr: 'नमस्कार, {name}' },
  'dash.subtitleNew': {
    en: 'Three steps and your first bill is out.',
    hi: 'तीन कदम और आपका पहला बिल तैयार।',
    mr: 'तीन पायऱ्या आणि तुमचे पहिले बिल तयार.',
  },
  'dash.today': { en: 'TODAY', hi: 'आज', mr: 'आज' },
  'dash.bills': { en: 'bills', hi: 'बिल', mr: 'बिल' },
  'dash.bill': { en: 'bill', hi: 'बिल', mr: 'बिल' },
  'dash.sold': { en: 'sold', hi: 'बिक्री', mr: 'विक्री' },
  'dash.collected': { en: 'collected', hi: 'वसूली', mr: 'वसुली' },
  'dash.totalSales': { en: 'Total Sales', hi: 'कुल बिक्री', mr: 'एकूण विक्री' },
  'dash.totalCollected': { en: 'Collected', hi: 'वसूल हुआ', mr: 'वसूल झाले' },
  'dash.totalPending': { en: 'Pending', hi: 'बाकी', mr: 'बाकी' },
  'dash.recentInvoices': { en: 'Recent Invoices', hi: 'हाल के बिल', mr: 'अलीकडचे बिल' },
  'dash.recentCustomers': { en: 'Recent Customers', hi: 'हाल के ग्राहक', mr: 'अलीकडचे ग्राहक' },
  'dash.noInvoices': { en: 'No invoices yet.', hi: 'अभी कोई बिल नहीं।', mr: 'अजून बिल नाही.' },
  'dash.noCustomers': { en: 'No customers yet.', hi: 'अभी कोई ग्राहक नहीं।', mr: 'अजून ग्राहक नाही.' },
  'dash.lowStockOne': { en: '{name} is running low', hi: '{name} कम हो रहा है', mr: '{name} कमी होत आहे' },
  'dash.lowStockMany': { en: '{count} materials are running low', hi: '{count} माल कम हो रहे हैं', mr: '{count} माल कमी होत आहेत' },
  'dash.topUp': { en: 'Top up →', hi: 'भरें →', mr: 'भरा →' },
  'dash.quickBill': { en: 'Bill', hi: 'बिल', mr: 'बिल' },
  'dash.quickCustomer': { en: 'Customer', hi: 'ग्राहक', mr: 'ग्राहक' },
  'dash.quickPayment': { en: 'Payment', hi: 'पेमेंट', mr: 'पेमेंट' },
  'dash.quickStock': { en: 'Stock', hi: 'स्टॉक', mr: 'स्टॉक' },

  // ── Customers ─────────────────────────────────────────────────────────
  'cust.title': { en: 'Customers', hi: 'ग्राहक', mr: 'ग्राहक' },
  'cust.subtitle': {
    en: 'Manage customers, sites, invoices and pending payments',
    hi: 'ग्राहक, साइट, बिल और बाकी पैसे',
    mr: 'ग्राहक, साईट, बिल आणि बाकी पैसे',
  },
  'cust.add': { en: 'Add customer', hi: 'ग्राहक जोड़ें', mr: 'ग्राहक जोडा' },
  'cust.searchPlaceholder': {
    en: 'Search by name, phone or site…',
    hi: 'नाम, फ़ोन या साइट से खोजें…',
    mr: 'नाव, फोन किंवा साईटने शोधा…',
  },
  'cust.notFound': { en: 'No customers found.', hi: 'कोई ग्राहक नहीं मिला।', mr: 'ग्राहक सापडला नाही.' },
  'cust.profileSubtitle': {
    en: 'Customer profile, khata and activity',
    hi: 'ग्राहक की जानकारी और खाता',
    mr: 'ग्राहकाची माहिती आणि खाते',
  },
  'cust.remind': { en: 'Remind via WhatsApp', hi: 'व्हाट्सएप पर याद दिलाएँ', mr: 'व्हॉट्सॲपवर आठवण करा' },
  'cust.receivePayment': { en: 'Receive payment', hi: 'पेमेंट लें', mr: 'पेमेंट घ्या' },
  'cust.repeatBill': { en: 'Repeat last bill', hi: 'पिछला बिल दोहराएँ', mr: 'मागचे बिल पुन्हा' },
  'cust.khata': { en: 'Khata — Invoices', hi: 'खाता — बिल', mr: 'खाते — बिल' },
  'cust.bySite': { en: 'By site', hi: 'साइट के हिसाब से', mr: 'साईटनुसार' },
  'cust.billed': { en: 'Billed {amount}', hi: 'बिल {amount}', mr: 'बिल {amount}' },
  'cust.settled': { en: 'Settled', hi: 'चुक्ता', mr: 'फिटले' },
  'cust.noInvoices': {
    en: 'No invoices for this customer yet.',
    hi: 'इस ग्राहक का अभी कोई बिल नहीं।',
    mr: 'या ग्राहकाचे अजून बिल नाही.',
  },
  'cust.editTitle': { en: 'Edit customer', hi: 'ग्राहक बदलें', mr: 'ग्राहक बदला' },
  'cust.addTitle': { en: 'Add customer', hi: 'ग्राहक जोड़ें', mr: 'ग्राहक जोडा' },
  'cust.usualSite': { en: 'Usual site (optional)', hi: 'आम साइट (ज़रूरी नहीं)', mr: 'नेहमीची साईट (ऐच्छिक)' },
  'cust.phoneHint': { en: '10-digit mobile number', hi: '10 अंकों का मोबाइल नंबर', mr: '10 अंकी मोबाईल नंबर' },
  'cust.saveCustomer': { en: 'Save customer', hi: 'ग्राहक सेव करें', mr: 'ग्राहक सेव करा' },
  'cust.saveChanges': { en: 'Save changes', hi: 'बदलाव सेव करें', mr: 'बदल सेव करा' },
  // Long form for the input label, short form for the profile card heading.
  'cust.creditLimit': { en: 'Udhaar limit (₹, optional)', hi: 'उधार की सीमा (₹, ज़रूरी नहीं)', mr: 'उधारीची मर्यादा (₹, ऐच्छिक)' },
  'cust.creditLimitShort': { en: 'Udhaar limit', hi: 'उधार की सीमा', mr: 'उधारीची मर्यादा' },
  'cust.creditLimitHint': {
    en: "You'll be warned while billing if this customer goes over it. It never blocks a bill.",
    hi: 'बिल बनाते समय इससे ऊपर जाने पर चेतावनी मिलेगी। बिल कभी नहीं रुकेगा।',
    mr: 'बिल करताना यापेक्षा जास्त झाल्यास सूचना मिळेल. बिल कधीच थांबणार नाही.',
  },
  'cust.overLimit': {
    en: '{name} will be at {pending} against an udhaar limit of {limit}.',
    hi: '{name} की उधारी {pending} हो जाएगी, सीमा {limit} है।',
    mr: '{name} ची उधारी {pending} होईल, मर्यादा {limit} आहे.',
  },
  'cust.nearLimit': {
    en: '{name} is at {pending} of their {limit} udhaar limit.',
    hi: '{name} की उधारी {limit} की सीमा में से {pending} है।',
    mr: '{name} ची उधारी {limit} पैकी {pending} आहे.',
  },
  'cust.noLastBill': {
    en: 'No earlier bill to repeat for this customer yet.',
    hi: 'इस ग्राहक का दोहराने लायक पुराना बिल नहीं है।',
    mr: 'या ग्राहकाचे पुन्हा करण्यासारखे जुने बिल नाही.',
  },

  // ── Materials & stock ─────────────────────────────────────────────────
  'mat.title': { en: 'Materials & Stock', hi: 'माल और स्टॉक', mr: 'माल आणि स्टॉक' },
  'mat.subtitle': {
    en: 'Your items, their rates and how much you have',
    hi: 'आपका माल, उसका रेट और कितना बचा है',
    mr: 'तुमचा माल, त्याचा रेट आणि किती शिल्लक आहे',
  },
  'mat.addMaterial': { en: 'Add material', hi: 'माल जोड़ें', mr: 'माल जोडा' },
  'mat.addStock': { en: 'Add stock', hi: 'स्टॉक जोड़ें', mr: 'स्टॉक जोडा' },
  'mat.shareRates': { en: 'Share rate list', hi: 'रेट लिस्ट भेजें', mr: 'रेट लिस्ट पाठवा' },
  'mat.stockValue': { en: 'Stock value', hi: 'स्टॉक की कीमत', mr: 'स्टॉकची किंमत' },
  'mat.lowStockItems': { en: 'Low stock items', hi: 'कम स्टॉक वाले', mr: 'कमी स्टॉक असलेले' },
  'mat.mine': { en: 'My Materials', hi: 'मेरा माल', mr: 'माझा माल' },
  'mat.catalog': { en: 'Browse Catalog', hi: 'कैटलॉग देखें', mr: 'कॅटलॉग पहा' },
  'mat.searchPlaceholder': { en: 'Search materials…', hi: 'माल खोजें…', mr: 'माल शोधा…' },
  'mat.notFound': { en: 'No materials found.', hi: 'कोई माल नहीं मिला।', mr: 'माल सापडला नाही.' },
  'mat.rateListEmpty': {
    en: 'Put a rate on at least one material first — a rate list with no rates helps nobody.',
    hi: 'पहले कम से कम एक माल का रेट डालें — बिना रेट की लिस्ट किसी काम की नहीं।',
    mr: 'आधी किमान एका मालाचा रेट टाका — रेट नसलेली यादी कामाची नाही.',
  },

  // ── Invoices ──────────────────────────────────────────────────────────
  'inv.createTitle': { en: 'Create Invoice', hi: 'बिल बनाएँ', mr: 'बिल तयार करा' },
  'inv.createSubtitle': {
    en: 'Site, materials and GST on one screen',
    hi: 'साइट, माल और जीएसटी एक ही जगह',
    mr: 'साईट, माल आणि जीएसटी एकाच ठिकाणी',
  },
  'inv.editTitle': { en: 'Edit Invoice', hi: 'बिल बदलें', mr: 'बिल बदला' },
  'inv.editSubtitle': {
    en: 'Fix a wrong quantity, rate or item — the bill number stays the same',
    hi: 'गलत मात्रा, रेट या माल ठीक करें — बिल नंबर वही रहेगा',
    mr: 'चुकीचे प्रमाण, रेट किंवा माल दुरुस्त करा — बिल नंबर तोच राहील',
  },
  'inv.newCustomer': { en: '+ New customer', hi: '+ नया ग्राहक', mr: '+ नवीन ग्राहक' },
  'inv.selectCustomer': { en: 'Select a customer…', hi: 'ग्राहक चुनें…', mr: 'ग्राहक निवडा…' },
  'inv.sitePlace': { en: 'Site / delivery place', hi: 'साइट / डिलीवरी की जगह', mr: 'साईट / डिलिव्हरीची जागा' },
  'inv.items': { en: 'Items', hi: 'माल', mr: 'माल' },
  'inv.addItem': { en: 'Add item', hi: 'और माल जोड़ें', mr: 'आणखी माल जोडा' },
  'inv.itemsHint': {
    en: "Your materials are listed below — just type the quantity for what you're selling. {count} on this bill.",
    hi: 'आपका सारा माल नीचे है — जो बेच रहे हैं बस उसकी मात्रा लिखें। इस बिल में {count}।',
    mr: 'तुमचा सर्व माल खाली आहे — जे विकत आहात त्याचे प्रमाण लिहा. या बिलात {count}.',
  },
  'inv.itemsHintPlain': { en: 'Add the items for this bill.', hi: 'इस बिल का माल जोड़ें।', mr: 'या बिलाचा माल जोडा.' },
  'inv.noMaterials': {
    en: 'No materials in your list yet — use "Add item".',
    hi: 'आपकी सूची में कोई माल नहीं — "और माल जोड़ें" दबाएँ।',
    mr: 'तुमच्या यादीत माल नाही — "आणखी माल जोडा" दाबा.',
  },
  'inv.notOnBill': { en: 'Not on this bill', hi: 'इस बिल में नहीं', mr: 'या बिलात नाही' },
  'inv.lastRate': { en: 'Last {rate} · {date}', hi: 'पिछला {rate} · {date}', mr: 'मागचा {rate} · {date}' },
  'inv.lastRateTitle': {
    en: 'Tap to use the rate you last charged this customer',
    hi: 'इस ग्राहक से पिछली बार लिया रेट लगाने के लिए दबाएँ',
    mr: 'या ग्राहकाकडून मागच्या वेळी घेतलेला रेट लावण्यासाठी दाबा',
  },
  'inv.material': { en: 'Material', hi: 'माल', mr: 'माल' },
  'inv.description': { en: 'Description', hi: 'ब्यौरा', mr: 'तपशील' },
  'inv.customMaterial': { en: 'Custom / choose material…', hi: 'अपना / माल चुनें…', mr: 'स्वतःचा / माल निवडा…' },
  'inv.applyGst': { en: 'Apply GST (18%)', hi: 'जीएसटी (18%) लगाएँ', mr: 'जीएसटी (18%) लावा' },
  'inv.transportLabour': {
    en: 'Transport + Labour (₹, optional)',
    hi: 'भाड़ा + मजदूरी (₹, ज़रूरी नहीं)',
    mr: 'भाडे + मजुरी (₹, ऐच्छिक)',
  },
  'inv.transportLabourShort': { en: 'Transport + Labour', hi: 'भाड़ा + मजदूरी', mr: 'भाडे + मजुरी' },
  'inv.subtotal': { en: 'Subtotal', hi: 'जोड़', mr: 'बेरीज' },
  'inv.gst': { en: 'GST (18%)', hi: 'जीएसटी (18%)', mr: 'जीएसटी (18%)' },
  'inv.grandTotal': { en: 'Grand Total', hi: 'कुल रकम', mr: 'एकूण रक्कम' },
  'inv.paymentNow': {
    en: 'Payment received now (optional)',
    hi: 'अभी मिला पेमेंट (ज़रूरी नहीं)',
    mr: 'आत्ता मिळालेले पेमेंट (ऐच्छिक)',
  },
  'inv.amountGiven': { en: 'Amount given by customer', hi: 'ग्राहक ने कितना दिया', mr: 'ग्राहकाने किती दिले' },
  'inv.remainingAfter': { en: 'Remaining after this', hi: 'इसके बाद बाकी', mr: 'यानंतर बाकी' },
  'inv.save': { en: 'Save invoice', hi: 'बिल सेव करें', mr: 'बिल सेव करा' },
  'inv.saveEdit': { en: 'Save changes', hi: 'बदलाव सेव करें', mr: 'बदल सेव करा' },
  'inv.delivery': { en: 'Delivery', hi: 'डिलीवरी', mr: 'डिलिव्हरी' },
  // The dialog after a bill is saved (DeliveryPrompt): the line under the
  // tick, then the question. A supplier's very first bill gets its own line.
  'inv.savedTitle': { en: '{no} saved', hi: '{no} सेव हो गया', mr: '{no} सेव झाले' },
  'inv.firstBillTitle': { en: 'Your first bill is ready', hi: 'आपका पहला बिल तैयार है', mr: 'तुमचे पहिले बिल तयार आहे' },
  'inv.deliveryQuestion': {
    en: 'Have you delivered the material to the customer?',
    hi: 'क्या माल ग्राहक को दे दिया?',
    mr: 'माल ग्राहकाला दिला का?',
  },
  'inv.deliveryHint': {
    en: 'If yes, stock will be reduced now to match this bill. If not yet, you can mark it delivered later from the Invoices list.',
    hi: 'हाँ करने पर स्टॉक अभी घट जाएगा। अभी नहीं तो बाद में बिल सूची से डिलीवर कर सकते हैं।',
    mr: 'होय केल्यास स्टॉक आत्ता कमी होईल. अजून नाही तर नंतर बिल यादीतून डिलिव्हर करू शकता.',
  },
  'inv.deliveredYes': { en: 'Yes, delivered', hi: 'हाँ, दे दिया', mr: 'होय, दिले' },
  'inv.deliveredNot': { en: 'Not yet', hi: 'अभी नहीं', mr: 'अजून नाही' },
  'inv.download': { en: 'Download PDF', hi: 'पीडीएफ डाउनलोड', mr: 'पीडीएफ डाउनलोड' },
  'inv.print': { en: 'Print', hi: 'प्रिंट', mr: 'प्रिंट' },
  'inv.cancelBill': { en: 'Cancel bill', hi: 'बिल रद्द करें', mr: 'बिल रद्द करा' },
  'inv.editBill': { en: 'Edit bill', hi: 'बिल बदलें', mr: 'बिल बदला' },
  'inv.remaining': { en: 'Remaining', hi: 'बाकी', mr: 'बाकी' },
  'inv.particulars': { en: 'Particulars', hi: 'ब्यौरा', mr: 'तपशील' },
  'inv.thankYou': { en: 'Thank you for your business!', hi: 'आपका बहुत धन्यवाद!', mr: 'तुमचे मनःपूर्वक आभार!' },
  'inv.walkIn': { en: 'Walk-in customer', hi: 'सीधा ग्राहक', mr: 'थेट ग्राहक' },
  'inv.cancelledBanner': { en: 'This bill was cancelled.', hi: 'यह बिल रद्द कर दिया गया।', mr: 'हे बिल रद्द केले आहे.' },
  'inv.cancelledDetail': {
    en: "It is not counted in your sales, this customer's khata, or any report. Any stock it used has been put back.",
    hi: 'यह बिक्री, ग्राहक के खाते या किसी रिपोर्ट में नहीं गिना जाता। इसका स्टॉक वापस जोड़ दिया गया है।',
    mr: 'हे विक्री, ग्राहकाचे खाते किंवा कोणत्याही रिपोर्टमध्ये मोजले जात नाही. याचा स्टॉक परत जमा केला आहे.',
  },

  // ── Payments ──────────────────────────────────────────────────────────
  'pay.title': { en: 'Payments', hi: 'पेमेंट', mr: 'पेमेंट' },
  'pay.subtitle': {
    en: 'Money received against your bills',
    hi: 'आपके बिलों पर मिला पैसा',
    mr: 'तुमच्या बिलांवर मिळालेले पैसे',
  },
  'pay.record': { en: 'Record payment', hi: 'पेमेंट दर्ज करें', mr: 'पेमेंट नोंदवा' },
  'pay.recording': { en: 'Recording…', hi: 'दर्ज हो रहा है…', mr: 'नोंदवत आहे…' },
  'pay.invoice': { en: 'Invoice', hi: 'बिल', mr: 'बिल' },
  'pay.selectInvoice': { en: 'Select an unpaid invoice…', hi: 'बाकी वाला बिल चुनें…', mr: 'बाकी असलेले बिल निवडा…' },
  'pay.amountReceived': { en: 'Amount received', hi: 'कितना मिला', mr: 'किती मिळाले' },
  'pay.alsoPaidBy': { en: 'Also paid by', hi: 'इसके अलावा', mr: 'याशिवाय' },
  'pay.addSplit': { en: '+ Paid partly by another mode?', hi: '+ कुछ हिस्सा दूसरे तरीके से?', mr: '+ काही भाग दुसऱ्या पद्धतीने?' },
  'pay.totalRecording': { en: 'Total being recorded', hi: 'कुल दर्ज हो रहा है', mr: 'एकूण नोंदवले जात आहे' },
  'pay.sendReceipt': { en: 'Send receipt on WhatsApp', hi: 'रसीद व्हाट्सएप पर भेजें', mr: 'पावती व्हॉट्सॲपवर पाठवा' },
  'pay.receiptMessage': {
    en: 'Received {amount} by {mode} on {date}. {balance} Thank you.',
    hi: '{date} को {mode} से {amount} मिले। {balance} धन्यवाद।',
    mr: '{date} रोजी {mode} ने {amount} मिळाले. {balance} धन्यवाद.',
  },
  'pay.receiptBalance': { en: 'Balance now {amount}.', hi: 'अब बाकी {amount}।', mr: 'आता बाकी {amount}.' },
  'pay.receiptSettled': { en: 'Your khata is fully settled.', hi: 'आपका खाता पूरा चुक्ता है।', mr: 'तुमचे खाते पूर्ण फिटले आहे.' },
  'pay.appliedTo': {
    en: 'Payment recorded against {count} bill(s).',
    hi: '{count} बिल पर पेमेंट दर्ज हो गया।',
    mr: '{count} बिलावर पेमेंट नोंदवले.',
  },
  // Under the tick once a payment is recorded.
  'pay.receivedAmount': { en: '{amount} received', hi: '{amount} मिल गए', mr: '{amount} मिळाले' },
  'pay.pendingNow': {
    en: 'Pending right now: {amount}. It goes to their oldest unpaid bills first; anything more is kept as advance.',
    hi: 'अभी बाकी: {amount}। रकम पहले सबसे पुराने बिलों में लगेगी; ज़्यादा हुई तो एडवांस में रहेगी।',
    mr: 'आत्ता बाकी: {amount}. रक्कम आधी सर्वात जुन्या बिलांना लागेल; जास्त असेल तर ॲडव्हान्स म्हणून राहील.',
  },
  // Receive payment when nothing is owed: say where the money goes.
  'pay.noDuesIntro': {
    en: 'No pending dues, so this payment will be kept as advance. Their next bill uses it automatically.',
    hi: 'कोई बकाया नहीं है, इसलिए यह भुगतान एडवांस में रखा जाएगा। अगले बिल में यह अपने-आप लग जाएगा।',
    mr: 'कोणतीही बाकी नाही, म्हणून हे पेमेंट ॲडव्हान्स म्हणून ठेवले जाईल. पुढच्या बिलात ते आपोआप वापरले जाईल.',
  },
  'pay.noDuesIntroHeld': {
    en: 'No pending dues, so this payment will be kept as advance, added to the {amount} they already hold. Their next bill uses it automatically.',
    hi: 'कोई बकाया नहीं है, इसलिए यह भुगतान एडवांस में रखा जाएगा और पहले से जमा {amount} में जुड़ेगा। अगले बिल में यह अपने-आप लग जाएगा।',
    mr: 'कोणतीही बाकी नाही, म्हणून हे पेमेंट ॲडव्हान्स म्हणून ठेवले जाईल आणि आधीच्या {amount} मध्ये जमा होईल. पुढच्या बिलात ते आपोआप वापरले जाईल.',
  },

  // ── Reminders ─────────────────────────────────────────────────────────
  'rem.title': { en: 'Pending Reminders', hi: 'बाकी वाले ग्राहक', mr: 'बाकी असलेले ग्राहक' },
  'rem.subtitle': {
    en: 'Sends the customer their full statement PDF — nothing goes out automatically',
    hi: 'ग्राहक को उनका पूरा हिसाब पीडीएफ में भेजता है — अपने आप कुछ नहीं जाता',
    mr: 'ग्राहकाला त्यांचा पूर्ण हिशोब पीडीएफमध्ये पाठवते — आपोआप काहीही जात नाही',
  },
  'rem.remind': { en: 'Remind', hi: 'याद दिलाएँ', mr: 'आठवण करा' },
  'rem.noPhone': { en: 'No phone on file', hi: 'फ़ोन नंबर नहीं है', mr: 'फोन नंबर नाही' },

  // ── Settings ──────────────────────────────────────────────────────────
  'set.language': { en: 'Language', hi: 'भाषा', mr: 'भाषा' },
  // Settings list: the short status beside a row.
  'set.on': { en: 'On', hi: 'चालू', mr: 'चालू' },
  'set.off': { en: 'Off', hi: 'बंद', mr: 'बंद' },
  'set.notSet': { en: 'Not set up', hi: 'सेट नहीं', mr: 'सेट केलेले नाही' },
  // Settings list: the grey line under each row's title.
  'set.rowBusinessSub': { en: 'Name, phone, address, GST, logo', hi: 'नाम, फ़ोन, पता, GST, लोगो', mr: 'नाव, फोन, पत्ता, GST, लोगो' },
  'set.ordersSub': { en: 'Customers order from your link', hi: 'ग्राहक आपकी लिंक से ऑर्डर करते हैं', mr: 'ग्राहक तुमच्या लिंकवरून ऑर्डर करतात' },
  'set.pinSub': {
    en: 'Asked before cancelling a bill or a big payment',
    hi: 'बिल रद्द करने या बड़े भुगतान से पहले पूछा जाता है',
    mr: 'बिल रद्द करण्यापूर्वी किंवा मोठ्या पेमेंटआधी विचारला जातो',
  },
  'set.pwSub': { en: 'The password you sign in with', hi: 'जिस पासवर्ड से आप साइन इन करते हैं', mr: 'ज्या पासवर्डने तुम्ही साइन इन करता' },
  'set.languageHint': {
    en: 'Changes the app for you only. Bills and PDFs stay in English so any customer can read them.',
    hi: 'सिर्फ़ आपके लिए बदलेगा। बिल और पीडीएफ अंग्रेज़ी में ही रहेंगे ताकि हर ग्राहक पढ़ सके।',
    mr: 'फक्त तुमच्यासाठी बदलेल. बिल आणि पीडीएफ इंग्रजीतच राहतील जेणेकरून प्रत्येक ग्राहक वाचू शकेल.',
  },
  'set.title': { en: 'Business profile', hi: 'बिज़नेस की जानकारी', mr: 'व्यवसायाची माहिती' },
  'set.subtitle': {
    en: 'Your business details, shown on invoices',
    hi: 'आपके बिज़नेस की जानकारी, जो बिल पर छपती है',
    mr: 'तुमच्या व्यवसायाची माहिती, जी बिलावर छापली जाते',
  },
  'set.logo': { en: 'Business logo', hi: 'बिज़नेस का लोगो', mr: 'व्यवसायाचा लोगो' },
  'set.noLogo': { en: 'No logo', hi: 'लोगो नहीं', mr: 'लोगो नाही' },
  'set.uploadLogo': { en: 'Upload new logo', hi: 'नया लोगो डालें', mr: 'नवीन लोगो टाका' },
  'set.uploading': { en: 'Uploading…', hi: 'अपलोड हो रहा है…', mr: 'अपलोड होत आहे…' },
  'set.businessName': { en: 'Business name', hi: 'बिज़नेस का नाम', mr: 'व्यवसायाचे नाव' },
  'set.businessAddress': { en: 'Business address', hi: 'बिज़नेस का पता', mr: 'व्यवसायाचा पत्ता' },
  'set.addressHint': {
    en: 'Shown on every bill and statement',
    hi: 'हर बिल और हिसाब पर दिखेगा',
    mr: 'प्रत्येक बिल आणि हिशोबावर दिसेल',
  },
  'set.gstNumber': { en: 'GST number', hi: 'जीएसटी नंबर', mr: 'जीएसटी नंबर' },
  'set.gstPlaceholder': {
    en: 'Leave blank if you are not GST registered',
    hi: 'जीएसटी नहीं है तो खाली छोड़ें',
    mr: 'जीएसटी नसेल तर रिकामे ठेवा',
  },
  'set.gstHint': {
    en: 'Leave this blank and new bills will start with GST switched off.',
    hi: 'खाली छोड़ने पर नए बिल में जीएसटी बंद रहेगा।',
    mr: 'रिकामे ठेवल्यास नवीन बिलात जीएसटी बंद राहील.',
  },
  'set.saved': { en: 'Saved!', hi: 'सेव हो गया!', mr: 'सेव झाले!' },

  // ── Sign in / password ────────────────────────────────────────────────
  'auth.signInTitle': { en: 'Sign in to your account', hi: 'अपने खाते में लॉग इन करें', mr: 'तुमच्या खात्यात लॉग इन करा' },
  'auth.email': { en: 'Email', hi: 'ईमेल', mr: 'ईमेल' },
  'auth.password': { en: 'Password', hi: 'पासवर्ड', mr: 'पासवर्ड' },
  'auth.forgot': { en: 'Forgot password?', hi: 'पासवर्ड भूल गए?', mr: 'पासवर्ड विसरलात?' },
  // Settings → Change password
  'set.pwTitle': { en: 'Change password', hi: 'पासवर्ड बदलें', mr: 'पासवर्ड बदला' },
  'set.pwHint': {
    en: 'Replace the password you were given with one only you know.',
    hi: 'आपको दिया गया पासवर्ड बदलकर ऐसा रखें जो सिर्फ़ आपको पता हो।',
    mr: 'तुम्हाला दिलेला पासवर्ड बदलून फक्त तुम्हालाच माहीत असलेला ठेवा.',
  },
  'set.pwCurrent': { en: 'Current password', hi: 'अभी का पासवर्ड', mr: 'सध्याचा पासवर्ड' },
  'set.pwNew': { en: 'New password', hi: 'नया पासवर्ड', mr: 'नवीन पासवर्ड' },
  'set.pwConfirm': { en: 'Type the new password again', hi: 'नया पासवर्ड फिर से लिखें', mr: 'नवीन पासवर्ड पुन्हा लिहा' },
  'set.pwShort': { en: 'At least {min} characters.', hi: 'कम से कम {min} अक्षर।', mr: 'किमान {min} अक्षरे.' },
  'set.pwMismatch': { en: "The two new passwords don't match.", hi: 'दोनों नए पासवर्ड एक जैसे नहीं हैं।', mr: 'दोन्ही नवीन पासवर्ड जुळत नाहीत.' },
  'set.pwSame': {
    en: 'The new password is the same as the current one.',
    hi: 'नया पासवर्ड अभी वाले जैसा ही है।',
    mr: 'नवीन पासवर्ड सध्याच्या पासवर्डसारखाच आहे.',
  },
  'set.pwWrong': {
    en: 'Current password is wrong. Nothing was changed.',
    hi: 'अभी का पासवर्ड गलत है। कुछ नहीं बदला गया।',
    mr: 'सध्याचा पासवर्ड चुकीचा आहे. काहीही बदलले नाही.',
  },
  'set.pwSave': { en: 'Change password', hi: 'पासवर्ड बदलें', mr: 'पासवर्ड बदला' },
  'set.pwLeaked': {
    en: 'This password has appeared in data leaks on other websites, so it is easy to guess. Please choose a different one.',
    hi: 'यह पासवर्ड दूसरी वेबसाइटों के डेटा लीक में मिल चुका है, इसलिए इसे आसानी से पहचाना जा सकता है। कृपया कोई दूसरा पासवर्ड चुनें।',
    mr: 'हा पासवर्ड इतर वेबसाइट्सच्या डेटा लीकमध्ये सापडला आहे, त्यामुळे तो सहज ओळखता येतो. कृपया दुसरा पासवर्ड निवडा.',
  },
  'set.pwChanged': {
    en: 'Password changed. Use the new one next time you sign in.',
    hi: 'पासवर्ड बदल गया। अगली बार नए पासवर्ड से साइन इन करें।',
    mr: 'पासवर्ड बदलला. पुढच्या वेळी नवीन पासवर्डने साइन इन करा.',
  },
  // The eye in the password field — read aloud, never shown.
  'auth.showPassword': { en: 'Show password', hi: 'पासवर्ड दिखाएँ', mr: 'पासवर्ड दाखवा' },
  'auth.hidePassword': { en: 'Hide password', hi: 'पासवर्ड छिपाएँ', mr: 'पासवर्ड लपवा' },
  'auth.signIn': { en: 'Sign in', hi: 'लॉग इन करें', mr: 'लॉग इन करा' },
  'auth.signingIn': { en: 'Signing in…', hi: 'लॉग इन हो रहा है…', mr: 'लॉग इन होत आहे…' },
  'auth.noAccount': { en: "Don't have an account?", hi: 'खाता नहीं है?', mr: 'खाते नाही?' },
  'auth.contactAdmin': {
    en: 'Contact the BuildSupply admin to get one created.',
    hi: 'खाता बनवाने के लिए BuildSupply एडमिन से संपर्क करें।',
    mr: 'खाते तयार करण्यासाठी BuildSupply अ‍ॅडमिनशी संपर्क करा.',
  },
  'auth.askSubscription': { en: 'Ask about a subscription', hi: 'सब्सक्रिप्शन के बारे में पूछें', mr: 'सबस्क्रिप्शनबद्दल विचारा' },
  'auth.resetTitle': { en: 'Reset your password', hi: 'पासवर्ड रीसेट करें', mr: 'पासवर्ड रीसेट करा' },
  'auth.resetSubtitle': {
    en: "We'll email you a link to set a new one.",
    hi: 'नया पासवर्ड बनाने का लिंक ईमेल पर भेजेंगे।',
    mr: 'नवीन पासवर्ड तयार करण्याची लिंक ईमेलवर पाठवू.',
  },
  'auth.checkInbox': {
    en: 'Check your inbox for a password reset link.',
    hi: 'अपना ईमेल देखें — रीसेट लिंक भेज दिया है।',
    mr: 'तुमचा ईमेल पहा — रीसेट लिंक पाठवली आहे.',
  },
  'auth.sendLink': { en: 'Send reset link', hi: 'रीसेट लिंक भेजें', mr: 'रीसेट लिंक पाठवा' },
  'auth.sending': { en: 'Sending…', hi: 'भेजा जा रहा है…', mr: 'पाठवत आहे…' },
  'auth.backToSignIn': { en: 'Back to sign in', hi: 'वापस लॉग इन पर', mr: 'परत लॉग इनवर' },
  'auth.setNewTitle': { en: 'Set a new password', hi: 'नया पासवर्ड बनाएँ', mr: 'नवीन पासवर्ड तयार करा' },
  'auth.setNewSubtitle': {
    en: 'Choose a new password for your account.',
    hi: 'अपने खाते के लिए नया पासवर्ड चुनें।',
    mr: 'तुमच्या खात्यासाठी नवीन पासवर्ड निवडा.',
  },
  'auth.newPassword': { en: 'New password', hi: 'नया पासवर्ड', mr: 'नवीन पासवर्ड' },
  'auth.updatePassword': { en: 'Update password', hi: 'पासवर्ड बदलें', mr: 'पासवर्ड बदला' },
  'auth.verifying': { en: 'Verifying link…', hi: 'लिंक जाँच रहे हैं…', mr: 'लिंक तपासत आहे…' },
  'auth.invalidLink': {
    en: 'This reset link is invalid or has already been used.',
    hi: 'यह रीसेट लिंक गलत है या पहले इस्तेमाल हो चुका है।',
    mr: 'ही रीसेट लिंक चुकीची आहे किंवा आधीच वापरली गेली आहे.',
  },

  // ── Blocked account ───────────────────────────────────────────────────
  'account.loadFailed': { en: "Couldn't open your account", hi: 'आपका खाता नहीं खुल सका', mr: 'तुमचे खाते उघडता आले नाही' },
  'account.loadFailedHint': {
    en: 'You are signed in, but your business details did not load. This is usually a weak connection — check your internet and try again.',
    hi: 'आप साइन इन हैं, पर आपके व्यापार की जानकारी लोड नहीं हुई। अक्सर यह कमज़ोर नेटवर्क की वजह से होता है — इंटरनेट देखकर फिर से कोशिश करें।',
    mr: 'तुम्ही साइन इन आहात, पण तुमच्या व्यवसायाची माहिती लोड झाली नाही. हे बहुतेक कमकुवत नेटवर्कमुळे होते — इंटरनेट तपासून पुन्हा प्रयत्न करा.',
  },
  'account.retry': { en: 'Try again', hi: 'फिर से कोशिश करें', mr: 'पुन्हा प्रयत्न करा' },
  'account.suspended': { en: 'Your account is suspended.', hi: 'आपका खाता रोक दिया गया है।', mr: 'तुमचे खाते थांबवले आहे.' },
  'account.deactivated': { en: 'Your account is deactivated.', hi: 'आपका खाता बंद कर दिया गया है।', mr: 'तुमचे खाते बंद केले आहे.' },
  'account.contactAdmin': {
    en: 'Contact the BuildSupply admin to restore access.',
    hi: 'दोबारा चालू कराने के लिए BuildSupply एडमिन से संपर्क करें।',
    mr: 'पुन्हा चालू करण्यासाठी BuildSupply अ‍ॅडमिनशी संपर्क करा.',
  },

  // ── Invoice list ──────────────────────────────────────────────────────
  'inv.listTitle': { en: 'Invoices', hi: 'बिल', mr: 'बिल' },
  'inv.listSubtitle': {
    en: 'Bills, PDF preview and WhatsApp delivery',
    hi: 'बिल, पीडीएफ और व्हाट्सएप पर भेजना',
    mr: 'बिल, पीडीएफ आणि व्हॉट्सॲपवर पाठवणे',
  },
  'inv.new': { en: 'New invoice', hi: 'नया बिल', mr: 'नवीन बिल' },
  'inv.searchPlaceholder': {
    en: 'Search by invoice no., name, address, site or phone…',
    hi: 'बिल नंबर, नाम, पता, साइट या फ़ोन से खोजें…',
    mr: 'बिल नंबर, नाव, पत्ता, साईट किंवा फोनने शोधा…',
  },
  'inv.colInvoice': { en: 'Invoice', hi: 'बिल', mr: 'बिल' },
  'inv.colDelivery': { en: 'Delivery', hi: 'डिलीवरी', mr: 'डिलिव्हरी' },
  'inv.noMatch': { en: 'No invoices match your search.', hi: 'खोज से कोई बिल नहीं मिला।', mr: 'शोधाशी जुळणारे बिल नाही.' },
  'inv.deliveredBadge': { en: 'Delivered', hi: 'दे दिया', mr: 'दिले' },
  'inv.markDelivered': { en: 'Mark delivered', hi: 'डिलीवर हुआ', mr: 'डिलिव्हर झाले' },
  'inv.marking': { en: 'Marking…', hi: 'हो रहा है…', mr: 'होत आहे…' },

  // ── Deliveries ────────────────────────────────────────────────────────
  'del.title': { en: 'Deliveries', hi: 'डिलीवरी', mr: 'डिलिव्हरी' },
  'del.subtitle': {
    en: 'Bills that still have to go out — marking one delivered reduces your stock',
    hi: 'जो माल अभी भेजना बाकी है — डिलीवर करने पर स्टॉक घट जाएगा',
    mr: 'जो माल अजून पाठवायचा आहे — डिलिव्हर केल्यावर स्टॉक कमी होईल',
  },
  'del.none': {
    en: 'Nothing pending — everything billed has been delivered.',
    hi: 'कुछ बाकी नहीं — सारा बिल किया माल दे दिया गया।',
    mr: 'काहीही बाकी नाही — बिल केलेला सर्व माल दिला आहे.',
  },
  'del.driverList': { en: 'Driver’s list', hi: 'ड्राइवर की सूची', mr: 'ड्रायव्हरची यादी' },
  'del.driverTitle': { en: 'Today’s delivery list', hi: 'आज की डिलीवरी सूची', mr: 'आजची डिलिव्हरी यादी' },
  'del.driverHint': {
    en: 'Bills from the last two days are ticked — tick any others going out today. The driver gets one PDF with each customer, phone, site and the materials — no amounts. Nothing is marked delivered.',
    hi: 'पिछले दो दिन के बिल चुने हुए हैं — आज जाने वाले और बिल भी चुनें। ड्राइवर को एक PDF मिलेगी — हर ग्राहक, फ़ोन, साइट और माल के साथ, बिना रकम के। कुछ भी डिलीवर दर्ज नहीं होता।',
    mr: 'मागच्या दोन दिवसांची बिले निवडलेली आहेत — आज जाणारी इतर बिलेही निवडा. ड्रायव्हरला एक PDF मिळेल — प्रत्येक ग्राहक, फोन, साइट आणि मालासह, रकमेशिवाय. काहीही डिलिव्हर म्हणून नोंदवले जात नाही.',
  },
  'del.picked': { en: '{count} selected', hi: '{count} चुने', mr: '{count} निवडले' },
  'del.selectAll': { en: 'Select all', hi: 'सब चुनें', mr: 'सर्व निवडा' },
  'del.selectNone': { en: 'Clear', hi: 'हटाएँ', mr: 'काढा' },
  'del.sendDriver': { en: 'Send on WhatsApp', hi: 'WhatsApp पर भेजें', mr: 'WhatsApp वर पाठवा' },
  'del.download': { en: 'Download PDF', hi: 'PDF डाउनलोड करें', mr: 'PDF डाउनलोड करा' },
  'del.driverMessage': {
    en: 'Today’s deliveries — {count} stops. Please tick each one when the load is off.',
    hi: 'आज की डिलीवरी — {count} जगह। हर जगह माल उतरने पर टिक करें।',
    mr: 'आजच्या डिलिव्हरी — {count} ठिकाणे. प्रत्येक ठिकाणी माल उतरल्यावर टिक करा.',
  },
  // Payments → Receive payment: "Who paid?" first, then that customer's own Receive payment.
  'pay.whoPaid': { en: 'Who paid?', hi: 'किसने भुगतान किया?', mr: 'कोणी पेमेंट केले?' },
  // Orders → Share order link (shareable where the orders arrive).
  'ord.shareLink': { en: 'Share order link', hi: 'ऑर्डर लिंक भेजें', mr: 'ऑर्डर लिंक पाठवा' },
  // The order QR screen, under the business name.
  'ordShare.scanToOrder': { en: 'Scan to order', hi: 'स्कैन करके ऑर्डर करें', mr: 'स्कॅन करून ऑर्डर करा' },
  'ord.setupLink': { en: 'Set up order link', hi: 'ऑर्डर लिंक बनाएँ', mr: 'ऑर्डर लिंक तयार करा' },
  // Share order link → "link or QR?"
  'ordShare.hint': {
    en: 'Customers open the link or scan the QR to order — no app or sign-in needed.',
    hi: 'ग्राहक लिंक खोलकर या QR स्कैन करके ऑर्डर कर सकते हैं — कोई ऐप या लॉगिन नहीं।',
    mr: 'ग्राहक लिंक उघडून किंवा QR स्कॅन करून ऑर्डर करू शकतात — कोणतेही ॲप किंवा लॉगिन नको.',
  },
  'ordShare.sendLink': { en: 'Send link', hi: 'लिंक भेजें', mr: 'लिंक पाठवा' },
  'ordShare.showQr': { en: 'Show QR code', hi: 'QR कोड दिखाएँ', mr: 'QR कोड दाखवा' },
  'ordShare.qrHint': {
    en: 'A customer at your counter scans this with their phone camera to open your order page. Share the image to send it, or to print it for your shop.',
    hi: 'दुकान पर आया ग्राहक फ़ोन के कैमरे से इसे स्कैन करके आपका ऑर्डर पेज खोल सकता है। भेजने के लिए या दुकान पर लगाने को छापने के लिए इमेज शेयर करें।',
    mr: 'दुकानात आलेला ग्राहक फोनच्या कॅमेऱ्याने हे स्कॅन करून तुमचे ऑर्डर पेज उघडू शकतो. पाठवण्यासाठी किंवा दुकानात लावण्यासाठी छापायला इमेज शेअर करा.',
  },
  'ordShare.shareQr': { en: 'Share QR image', hi: 'QR इमेज भेजें', mr: 'QR इमेज पाठवा' },
  'ordShare.back': { en: 'Back', hi: 'वापस', mr: 'मागे' },
  // The phone's top bar: ← on an inner screen.
  'common.back': { en: 'Back', hi: 'वापस', mr: 'मागे' },
  // Add customer → the phone's contact picker.
  'cust.pickContacts': { en: 'Pick from phone contacts', hi: 'फ़ोन कॉन्टैक्ट से चुनें', mr: 'फोन कॉन्टॅक्टमधून निवडा' },
  'cust.pickedTitle': { en: 'Check before adding', hi: 'जोड़ने से पहले देख लें', mr: 'जोडण्यापूर्वी तपासा' },
  'cust.pickedNoPhone': { en: 'No 10-digit mobile number', hi: '10 अंकों का मोबाइल नंबर नहीं', mr: '10 अंकी मोबाईल नंबर नाही' },
  'cust.addMany': { en: 'Add {count} customers', hi: '{count} ग्राहक जोड़ें', mr: '{count} ग्राहक जोडा' },
  'cust.addedMany': { en: 'Added {count}.', hi: '{count} जोड़े गए।', mr: '{count} जोडले.' },
  'cust.skippedMany': { en: 'Not added:', hi: 'नहीं जोड़े गए:', mr: 'जोडले नाहीत:' },
  'pay.nobodyOwes': {
    en: 'Nobody owes you anything right now.',
    hi: 'अभी किसी पर कुछ बाकी नहीं है।',
    mr: 'सध्या कोणाकडेही काही बाकी नाही.',
  },
  'pay.whoPaidHint': {
    en: 'Their oldest bills are cleared first, and anything extra is kept as advance — the same as on the customer’s page.',
    hi: 'पहले उनके सबसे पुराने बिल चुकते होंगे, और बाकी पैसा जमा में रहेगा — ग्राहक के पेज की तरह ही।',
    mr: 'आधी त्यांची सर्वात जुनी बिले भरली जातील, आणि उरलेले पैसे जमा म्हणून राहतील — ग्राहकाच्या पेजप्रमाणेच.',
  },
  'pay.forOneBill': { en: 'For one particular bill →', hi: 'किसी एक बिल के लिए →', mr: 'एखाद्या विशिष्ट बिलासाठी →' },

  // ── Estimates / quotations ────────────────────────────────────────────
  'status.Draft': { en: 'Draft', hi: 'ड्राफ्ट', mr: 'ड्राफ्ट' },
  'status.Sent': { en: 'Sent', hi: 'भेजा गया', mr: 'पाठवले' },
  'status.Converted': { en: 'Converted', hi: 'बिल बन गया', mr: 'बिल झाले' },
  'status.Expired': { en: 'Expired', hi: 'समय निकल गया', mr: 'मुदत संपली' },
  'quo.title': { en: 'Estimates & Quotations', hi: 'अनुमान और कोटेशन', mr: 'अंदाज आणि कोटेशन' },
  'quo.subtitle': {
    en: 'Send estimates over WhatsApp and convert them to invoices in one click',
    hi: 'व्हाट्सएप पर अनुमान भेजें और एक क्लिक में बिल बना दें',
    mr: 'व्हॉट्सॲपवर अंदाज पाठवा आणि एका क्लिकमध्ये बिल करा',
  },
  'quo.new': { en: 'New Estimate', hi: 'नया अनुमान', mr: 'नवीन अंदाज' },
  'quo.colNo': { en: 'No.', hi: 'नंबर', mr: 'नंबर' },
  'quo.convert': { en: 'Convert to Invoice', hi: 'बिल बनाएँ', mr: 'बिल करा' },
  'quo.converting': { en: 'Converting…', hi: 'बन रहा है…', mr: 'होत आहे…' },
  'quo.newSubtitle': {
    en: "Site, materials and GST — shareable as a PDF, doesn't touch stock or ledgers",
    hi: 'साइट, माल और जीएसटी — पीडीएफ में भेजें, स्टॉक या खाते पर कोई असर नहीं',
    mr: 'साईट, माल आणि जीएसटी — पीडीएफमध्ये पाठवा, स्टॉक किंवा खात्यावर परिणाम नाही',
  },
  'quo.noItems': { en: 'No items added yet.', hi: 'अभी कोई माल नहीं जोड़ा।', mr: 'अजून माल जोडला नाही.' },
  'quo.save': { en: 'Save estimate', hi: 'अनुमान सेव करें', mr: 'अंदाज सेव करा' },
  'quo.detailTitle': { en: 'Estimate', hi: 'अनुमान', mr: 'अंदाज' },
  'quo.notTaxInvoice': {
    en: 'This is an estimate, not a tax invoice.',
    hi: 'यह सिर्फ़ अनुमान है, टैक्स बिल नहीं।',
    mr: 'हा फक्त अंदाज आहे, टॅक्स बिल नाही.',
  },
  'quo.convertedAsk': {
    en: '{quote} is now {no}. Have you delivered the material to the customer?',
    hi: '{quote} अब {no} बन गया। क्या माल ग्राहक को दे दिया?',
    mr: '{quote} आता {no} झाले. माल ग्राहकाला दिला का?',
  },

  // ── Reports ───────────────────────────────────────────────────────────
  // Only the screen is translated. The PDFs themselves stay English — see
  // the note in Settings about why documents don't follow the app language.
  'rep.title': { en: 'Reports', hi: 'रिपोर्ट', mr: 'रिपोर्ट' },
  'rep.subtitle': {
    en: 'Download your records as PDF — generated in your browser',
    hi: 'अपना रिकॉर्ड पीडीएफ में डाउनलोड करें — आपके ही फ़ोन में बनता है',
    mr: 'तुमचा रेकॉर्ड पीडीएफमध्ये डाउनलोड करा — तुमच्याच फोनमध्ये तयार होतो',
  },
  'rep.from': { en: 'From', hi: 'से', mr: 'पासून' },
  'rep.to': { en: 'To', hi: 'तक', mr: 'पर्यंत' },
  'rep.allCustomers': { en: 'All customers', hi: 'सभी ग्राहक', mr: 'सर्व ग्राहक' },
  'rep.allSites': { en: 'All sites', hi: 'सभी साइट', mr: 'सर्व साईट' },
  'rep.allSitesOf': { en: 'All sites of {name}', hi: '{name} की सभी साइट', mr: '{name} च्या सर्व साईट' },
  'rep.clearFilters': { en: 'Clear filters', hi: 'फ़िल्टर हटाएँ', mr: 'फिल्टर काढा' },
  'rep.dailySales': { en: 'Daily Sales Report', hi: 'रोज़ की बिक्री', mr: 'रोजची विक्री' },
  'rep.dailyHint': {
    en: 'Set From and To to the same day. {count} invoice(s) in range.',
    hi: '"से" और "तक" एक ही दिन रखें। इस दायरे में {count} बिल।',
    mr: '"पासून" आणि "पर्यंत" एकाच दिवशी ठेवा. या मर्यादेत {count} बिल.',
  },
  'rep.monthlySales': { en: 'Monthly Sales Report', hi: 'महीने की बिक्री', mr: 'महिन्याची विक्री' },
  'rep.monthlyHint': {
    en: 'Set From and To to cover the month. {count} invoice(s) in range.',
    hi: '"से" और "तक" पूरे महीने पर रखें। इस दायरे में {count} बिल।',
    mr: '"पासून" आणि "पर्यंत" पूर्ण महिन्यावर ठेवा. या मर्यादेत {count} बिल.',
  },
  'rep.pendingAmount': { en: 'Pending Amount Report', hi: 'बाकी रकम', mr: 'बाकी रक्कम' },
  'rep.pendingHint': {
    en: 'Customers who still owe money. {count} customer(s) match your filters.',
    hi: 'जिन ग्राहकों की उधारी बाकी है। फ़िल्टर से {count} ग्राहक मिले।',
    mr: 'ज्या ग्राहकांची उधारी बाकी आहे. फिल्टरने {count} ग्राहक मिळाले.',
  },
  'rep.customerLedger': { en: 'Customer Ledger', hi: 'ग्राहक का खाता', mr: 'ग्राहकाचे खाते' },
  'rep.ledgerPick': {
    en: 'Pick a customer above to generate their ledger.',
    hi: 'खाता बनाने के लिए ऊपर से ग्राहक चुनें।',
    mr: 'खाते तयार करण्यासाठी वरून ग्राहक निवडा.',
  },
  'rep.ledgerHint': {
    en: 'Statement for {name} — {scope}. Bills, every payment with its mode, and the balance due.',
    hi: '{name} का हिसाब — {scope}। बिल, हर पेमेंट का तरीका, और बाकी रकम।',
    mr: '{name} चा हिशोब — {scope}. बिल, प्रत्येक पेमेंटची पद्धत, आणि बाकी रक्कम.',
  },
  'rep.scopeOneSite': { en: 'site "{site}" only', hi: 'सिर्फ़ "{site}" साइट', mr: 'फक्त "{site}" साईट' },
  'rep.scopeManySites': {
    en: 'all {count} sites (pick one above to narrow it)',
    hi: 'सभी {count} साइट (ऊपर से एक चुन सकते हैं)',
    mr: 'सर्व {count} साईट (वरून एक निवडू शकता)',
  },
  'rep.scopeAllSites': { en: 'all sites', hi: 'सभी साइट', mr: 'सर्व साईट' },
  'rep.materialWise': { en: 'Material Wise Sales', hi: 'माल के हिसाब से बिक्री', mr: 'मालानुसार विक्री' },
  'rep.materialHint': {
    en: 'Quantity and value sold per material. {count} material(s) in range.',
    hi: 'हर माल की कितनी मात्रा और कितने की बिक्री। इस दायरे में {count} माल।',
    mr: 'प्रत्येक मालाचे किती प्रमाण आणि किती विक्री. या मर्यादेत {count} माल.',
  },
  'rep.stockReport': { en: 'Stock Report', hi: 'स्टॉक रिपोर्ट', mr: 'स्टॉक रिपोर्ट' },
  'rep.stockHint': {
    en: 'Current stock on hand — not affected by date filters. {count} material(s).',
    hi: 'अभी कितना स्टॉक है — तारीख के फ़िल्टर का असर नहीं। {count} माल।',
    mr: 'आत्ता किती स्टॉक आहे — तारखेच्या फिल्टरचा परिणाम नाही. {count} माल.',
  },
  // ── Payment modes ─────────────────────────────────────────────────────
  // Display only. The value stored in `payments.mode` stays the English
  // string the database and every report expect.
  'mode.Cash': { en: 'Cash', hi: 'नकद', mr: 'रोख' },
  'mode.UPI': { en: 'UPI', hi: 'UPI', mr: 'UPI' },
  'mode.Bank/Cheque': { en: 'Bank/Cheque', hi: 'बैंक/चेक', mr: 'बँक/चेक' },

  // ── Cancelling a bill ─────────────────────────────────────────────────
  'inv.cancelTitle': { en: 'Cancel this bill?', hi: 'यह बिल रद्द करें?', mr: 'हे बिल रद्द करायचे?' },
  'inv.cancelIntro': {
    en: "{no} will stop counting in your sales and in {customer}'s khata.",
    hi: '{no} आपकी बिक्री और {customer} के खाते में गिनना बंद हो जाएगा।',
    mr: '{no} तुमच्या विक्रीत आणि {customer} च्या खात्यात मोजले जाणार नाही.',
  },
  'inv.cancelTheCustomer': { en: 'the customer', hi: 'ग्राहक', mr: 'ग्राहक' },
  'inv.cancelStock': {
    en: 'The stock it used will be added back.',
    hi: 'इसका इस्तेमाल हुआ स्टॉक वापस जुड़ जाएगा।',
    mr: 'याचा वापरलेला स्टॉक परत जमा होईल.',
  },
  'inv.cancelKept': {
    en: 'The bill stays in your records, marked cancelled.',
    hi: 'बिल रिकॉर्ड में रहेगा, रद्द लिखा हुआ।',
    mr: 'बिल रेकॉर्डमध्ये राहील, रद्द असे लिहिलेले.',
  },
  'inv.keepBill': { en: 'Keep bill', hi: 'बिल रहने दें', mr: 'बिल राहू द्या' },
  'inv.cancelling': { en: 'Cancelling…', hi: 'रद्द हो रहा है…', mr: 'रद्द होत आहे…' },
  'inv.confirmCancel': { en: 'Yes, cancel it', hi: 'हाँ, रद्द करें', mr: 'होय, रद्द करा' },

  // ── Materials: catalog + stock modal + form ───────────────────────────
  'cust.noSite': { en: 'No site recorded', hi: 'कोई साइट नहीं लिखी', mr: 'साईट नोंदवली नाही' },
  'mat.catalogBlurb': {
    en: 'Materials your admin has added — pick one to add it to your own list with your own price and stock.',
    hi: 'एडमिन का जोड़ा हुआ माल — चुनकर अपनी सूची में अपने रेट और स्टॉक के साथ जोड़ें।',
    mr: 'अ‍ॅडमिनने जोडलेला माल — निवडून तुमच्या यादीत तुमच्या रेट आणि स्टॉकसह जोडा.',
  },
  'mat.cantFind': {
    en: "Can't find your material? + Add Custom Material",
    hi: 'माल नहीं मिला? + अपना माल जोड़ें',
    mr: 'माल सापडला नाही? + स्वतःचा माल जोडा',
  },
  'mat.catalogSearch': {
    en: 'Search — try “cement”, “12mm”, “river”, “400 cft”…',
    hi: 'खोजें — जैसे “cement”, “12mm”, “river”, “400 cft”…',
    mr: 'शोधा — उदा. “cement”, “12mm”, “river”, “400 cft”…',
  },
  'mat.searching': { en: 'Searching…', hi: 'खोज रहे हैं…', mr: 'शोधत आहे…' },
  'mat.catalogNone': { en: 'No catalog materials found.', hi: 'कैटलॉग में कोई माल नहीं मिला।', mr: 'कॅटलॉगमध्ये माल सापडला नाही.' },
  'mat.alreadyAdded': { en: 'Already added', hi: 'पहले से जुड़ा है', mr: 'आधीच जोडले आहे' },
  'mat.adding': { en: 'Adding…', hi: 'जुड़ रहा है…', mr: 'जोडत आहे…' },
  'mat.addToMine': { en: 'Add to my materials', hi: 'मेरे माल में जोड़ें', mr: 'माझ्या मालात जोडा' },
  'mat.category': { en: 'Category', hi: 'श्रेणी', mr: 'प्रकार' },
  'mat.per': { en: 'Per (e.g. / truck)', hi: 'प्रति (जैसे / ट्रक)', mr: 'प्रति (उदा. / ट्रक)' },
  'mat.unitLabel': { en: 'Unit label (e.g. Truck 400 CFT)', hi: 'यूनिट (जैसे ट्रक 400 CFT)', mr: 'युनिट (उदा. ट्रक 400 CFT)' },
  'mat.lowStockBelow': { en: 'Low stock alert below', hi: 'इससे कम होने पर चेतावनी', mr: 'यापेक्षा कमी झाल्यास सूचना' },
  'mat.selectMaterial': { en: 'Select from your materials…', hi: 'अपने माल में से चुनें…', mr: 'तुमच्या मालातून निवडा…' },
  'mat.currentlyInStock': {
    en: 'Currently {qty} in stock',
    hi: 'अभी {qty} स्टॉक में है',
    mr: 'सध्या {qty} स्टॉकमध्ये आहे',
  },
  'mat.qtyToAdd': { en: 'Quantity to add', hi: 'कितना जोड़ना है', mr: 'किती जोडायचे' },
  'mat.newTotal': { en: 'New total will be {qty}', hi: 'नया कुल {qty} हो जाएगा', mr: 'नवीन एकूण {qty} होईल' },

  // ── Theme toggle ──────────────────────────────────────────────────────
  'theme.toLight': { en: 'Switch to light mode', hi: 'उजला मोड करें', mr: 'उजळ मोड करा' },
  'theme.toDark': { en: 'Switch to dark mode', hi: 'गहरा मोड करें', mr: 'गडद मोड करा' },
  // The More sheet's tile — short, under its icon.
  'theme.dark': { en: 'Dark mode', hi: 'गहरा मोड', mr: 'गडद मोड' },
  'theme.light': { en: 'Light mode', hi: 'उजला मोड', mr: 'उजळ मोड' },
  // ── Subscription notice shown to the supplier ─────────────────────────
  'sub.expired': {
    en: 'Your BuildSupply subscription has ended.',
    hi: 'आपका BuildSupply सब्सक्रिप्शन खत्म हो गया है।',
    mr: 'तुमचे BuildSupply सबस्क्रिप्शन संपले आहे.',
  },
  'sub.expiringToday': {
    en: 'Your BuildSupply subscription ends today.',
    hi: 'आपका BuildSupply सब्सक्रिप्शन आज खत्म हो रहा है।',
    mr: 'तुमचे BuildSupply सबस्क्रिप्शन आज संपत आहे.',
  },
  'sub.expiringDays': {
    en: 'Your BuildSupply subscription ends in {days} days.',
    hi: 'आपका BuildSupply सब्सक्रिप्शन {days} दिन में खत्म हो रहा है।',
    mr: 'तुमचे BuildSupply सबस्क्रिप्शन {days} दिवसांत संपत आहे.',
  },
  'sub.renew': { en: 'Renew', hi: 'रिन्यू करें', mr: 'रिन्यू करा' },
  // ── Confirmation PIN ──────────────────────────────────────────────────
  'pin.confirmTitle': { en: 'Confirm it is you', hi: 'पुष्टि करें कि यह आप हैं', mr: 'तुम्हीच आहात याची खात्री करा' },
  'pin.confirmBody': {
    en: 'Enter your 4-digit PIN to {action}.',
    hi: '{action} के लिए अपना 4 अंकों का पिन डालें।',
    mr: '{action} साठी तुमचा 4 अंकी पिन टाका.',
  },
  'pin.confirm': { en: 'Confirm', hi: 'पुष्टि करें', mr: 'खात्री करा' },
  'pin.checking': { en: 'Checking…', hi: 'जाँच रहे हैं…', mr: 'तपासत आहे…' },
  'pin.wrong': {
    en: 'Wrong PIN. {left} tries left before it locks.',
    hi: 'गलत पिन। लॉक होने से पहले {left} कोशिश बाकी।',
    mr: 'चुकीचा पिन. लॉक होण्याआधी {left} प्रयत्न बाकी.',
  },
  'pin.lockedOut': {
    en: 'Too many wrong tries. Try again after {time}.',
    hi: 'बहुत बार गलत पिन। {time} के बाद कोशिश करें।',
    mr: 'खूप वेळा चुकीचा पिन. {time} नंतर प्रयत्न करा.',
  },
  'pin.failed': { en: 'Could not check the PIN. Try again.', hi: 'पिन जाँच नहीं सका। दोबारा कोशिश करें।', mr: 'पिन तपासता आला नाही. पुन्हा प्रयत्न करा.' },

  // Settings card
  'pin.title': { en: 'Confirmation PIN', hi: 'पुष्टि पिन', mr: 'खात्री पिन' },
  'pin.hint': {
    en: 'A 4-digit PIN asked before anything that cannot be undone — cancelling a bill, editing one, or taking a large payment. It confirms it is you, it is not a password.',
    hi: '4 अंकों का पिन, जो न पलटने वाले काम से पहले पूछा जाएगा — बिल रद्द करना, बदलना, या बड़ी रकम लेना। यह पहचान के लिए है, पासवर्ड नहीं।',
    mr: '4 अंकी पिन, जो न बदलता येणाऱ्या कामाआधी विचारला जाईल — बिल रद्द करणे, बदलणे, किंवा मोठी रक्कम घेणे. ही ओळख आहे, पासवर्ड नाही.',
  },
  'pin.notSet': { en: 'No PIN set', hi: 'कोई पिन नहीं', mr: 'पिन नाही' },
  'pin.isSet': { en: 'PIN is on', hi: 'पिन चालू है', mr: 'पिन चालू आहे' },
  'pin.newPin': { en: 'New 4-digit PIN', hi: 'नया 4 अंकों का पिन', mr: 'नवीन 4 अंकी पिन' },
  'pin.currentPin': { en: 'Current PIN', hi: 'अभी का पिन', mr: 'सध्याचा पिन' },
  'pin.setIt': { en: 'Turn on PIN', hi: 'पिन चालू करें', mr: 'पिन चालू करा' },
  'pin.changeIt': { en: 'Change PIN', hi: 'पिन बदलें', mr: 'पिन बदला' },
  'pin.removeIt': { en: 'Turn off PIN', hi: 'पिन बंद करें', mr: 'पिन बंद करा' },
  'pin.saved': { en: 'PIN saved.', hi: 'पिन सेव हो गया।', mr: 'पिन सेव झाला.' },
  'pin.removed': { en: 'PIN turned off.', hi: 'पिन बंद हो गया।', mr: 'पिन बंद झाला.' },
  'pin.threshold': { en: 'Ask for PIN on payments of (₹)', hi: 'इतनी या ज़्यादा रकम पर पिन पूछें (₹)', mr: 'एवढ्या किंवा जास्त रकमेवर पिन विचारा (₹)' },

  // Reasons shown in the prompt
  'pin.reasonCancelBill': { en: 'cancel this bill', hi: 'यह बिल रद्द करने', mr: 'हे बिल रद्द करण्या' },
  'pin.reasonEditBill': { en: 'change this bill', hi: 'यह बिल बदलने', mr: 'हे बिल बदलण्या' },
  'pin.reasonLargePayment': {
    en: 'record a payment of {amount}',
    hi: '{amount} का पेमेंट दर्ज करने',
    mr: '{amount} चे पेमेंट नोंदवण्या',
  },
  // Admin-side reasons (admin screens are English, but the prompt is shared)
  'pin.reasonSuspend': { en: 'suspend {name}', hi: '{name} को रोकने', mr: '{name} थांबवण्या' },
  'pin.reasonDeactivate': { en: 'deactivate {name}', hi: '{name} को बंद करने', mr: '{name} बंद करण्या' },
  'pin.reasonResetPassword': { en: "reset {name}'s password", hi: '{name} का पासवर्ड बदलने', mr: '{name} चा पासवर्ड बदलण्या' },
  'pin.reasonSubscription': { en: "change {name}'s subscription", hi: '{name} का सब्सक्रिप्शन बदलने', mr: '{name} चे सबस्क्रिप्शन बदलण्या' },
  'rep.otherReports': { en: 'All other reports', hi: 'बाकी सारी रिपोर्ट', mr: 'बाकी सर्व रिपोर्ट' },
  'rep.otherReportsHint': {
    en: 'Sales, pending, material-wise and stock — {count} reports',
    hi: 'बिक्री, बाकी, माल और स्टॉक — {count} रिपोर्ट',
    mr: 'विक्री, बाकी, माल आणि स्टॉक — {count} रिपोर्ट',
  },
  // ── Unsaved work ──────────────────────────────────────────────────────
  'unsaved.title': { en: 'Leave without saving?', hi: 'बिना सेव किए जाएँ?', mr: 'सेव न करता जायचे?' },
  'unsaved.bill': {
    en: 'This bill has not been saved. Everything you have typed will be lost.',
    hi: 'यह बिल सेव नहीं हुआ है। जो कुछ लिखा है सब चला जाएगा।',
    mr: 'हे बिल सेव झालेले नाही. जे काही लिहिले आहे ते सर्व जाईल.',
  },
  'unsaved.estimate': {
    en: 'This estimate has not been saved. Everything you have typed will be lost.',
    hi: 'यह अनुमान सेव नहीं हुआ है। जो कुछ लिखा है सब चला जाएगा।',
    mr: 'हा अंदाज सेव झालेला नाही. जे काही लिहिले आहे ते सर्व जाईल.',
  },
  'unsaved.stay': { en: 'Keep editing', hi: 'यहीं रहें', mr: 'इथेच राहा' },
  'unsaved.leave': { en: 'Leave anyway', hi: 'फिर भी जाएँ', mr: 'तरीही जा' },
  'common.showMore': { en: 'Show more', hi: 'और दिखाएँ', mr: 'आणखी दाखवा' },
  'common.showingOf': {
    en: 'Showing {shown} of {total}',
    hi: '{total} में से {shown} दिख रहे हैं',
    mr: '{total} पैकी {shown} दिसत आहेत',
  },
  'common.required': { en: 'required', hi: 'ज़रूरी', mr: 'आवश्यक' },

  // ── Empty states ──────────────────────────────────────────────────────
  // Two different things, deliberately worded apart. A *Title/Hint* pair is
  // for a supplier who has not started yet — it says what the screen is for
  // and the button next to it starts them off. A *NoMatch* line is for a
  // search that found nothing, where the supplier knows perfectly well what
  // the screen is for and just wants their list back.
  'empty.customersTitle': { en: 'No customers yet', hi: 'अभी कोई ग्राहक नहीं', mr: 'अजून ग्राहक नाही' },
  'empty.customersHint': {
    en: 'Add the people you sell to. Their khata, pending balance and bills all sit here.',
    hi: 'जिन्हें आप माल बेचते हैं उन्हें जोड़ें। उनका खाता, बाकी और बिल सब यहीं रहेंगे।',
    mr: 'ज्यांना तुम्ही माल विकता त्यांना जोडा. त्यांचे खाते, बाकी आणि बिल सर्व इथेच राहील.',
  },
  'empty.customersNoMatch': {
    en: 'No customers match your search.',
    hi: 'खोज से कोई ग्राहक नहीं मिला।',
    mr: 'शोधाशी जुळणारा ग्राहक नाही.',
  },
  'empty.invoicesTitle': { en: 'No bills yet', hi: 'अभी कोई बिल नहीं', mr: 'अजून बिल नाही' },
  'empty.invoicesHint': {
    en: 'Make a bill in a few taps and send it straight to the customer on WhatsApp.',
    hi: 'कुछ ही टैप में बिल बनाएँ और सीधे ग्राहक को WhatsApp पर भेजें।',
    mr: 'काही टॅपमध्ये बिल बनवा आणि थेट ग्राहकाला WhatsApp वर पाठवा.',
  },
  'empty.quotationsTitle': { en: 'No estimates yet', hi: 'अभी कोई कोटेशन नहीं', mr: 'अजून कोटेशन नाही' },
  'empty.quotationsHint': {
    en: 'Send rates before the order. When it comes through, turn the estimate into a bill in one tap.',
    hi: 'ऑर्डर से पहले रेट भेजें। ऑर्डर मिलते ही एक टैप में कोटेशन को बिल बना लें।',
    mr: 'ऑर्डरआधी रेट पाठवा. ऑर्डर मिळताच एका टॅपमध्ये कोटेशनचे बिल करा.',
  },
  'empty.paymentsTitle': { en: 'No payments yet', hi: 'अभी कोई पेमेंट नहीं', mr: 'अजून पेमेंट नाही' },
  'empty.paymentsHint': {
    en: 'Record what a customer pays and their khata updates on its own.',
    hi: 'ग्राहक जो पेमेंट करे उसे दर्ज करें — खाता अपने आप अपडेट हो जाएगा।',
    mr: 'ग्राहकाने केलेले पेमेंट नोंदवा — खाते आपोआप अपडेट होईल.',
  },
  'empty.materialsTitle': { en: 'No materials yet', hi: 'अभी कोई माल नहीं', mr: 'अजून माल नाही' },
  'empty.materialsHint': {
    en: 'Pick from the catalog and the unit and rate come filled in — or add your own item.',
    hi: 'कैटलॉग से चुनें, यूनिट और रेट भरे हुए मिलेंगे — या अपना माल जोड़ें।',
    mr: 'कॅटलॉगमधून निवडा, युनिट आणि रेट भरलेले मिळतील — किंवा स्वतःचा माल जोडा.',
  },
  'empty.materialsNoMatch': {
    en: 'No materials match your search.',
    hi: 'खोज से कोई माल नहीं मिला।',
    mr: 'शोधाशी जुळणारा माल नाही.',
  },
  'empty.remindersTitle': { en: "Everyone's paid up", hi: 'सबका हिसाब चुक्ता है', mr: 'सर्वांचा हिशोब फिटला आहे' },
  'empty.remindersHint': {
    en: 'No customer has a pending balance right now. Nothing to chase.',
    hi: 'अभी किसी ग्राहक की उधारी बाकी नहीं है। किसी को याद दिलाने की ज़रूरत नहीं।',
    mr: 'सध्या कोणत्याही ग्राहकाची उधारी बाकी नाही. कोणालाही आठवण करायची गरज नाही.',
  },

  // ── Start here (the dashboard before the first bill) ──────────────────
  'start.label': { en: 'START HERE', hi: 'यहाँ से शुरू करें', mr: 'इथून सुरुवात करा' },
  'start.progress': { en: '{done} of {total} done', hi: '{total} में से {done} पूरे', mr: '{total} पैकी {done} पूर्ण' },
  'start.materialsTitle': { en: 'Add your materials', hi: 'अपना माल जोड़ें', mr: 'तुमचा माल जोडा' },
  'start.materialsHint': {
    en: 'Pick from the catalog — the unit and rate fill themselves in.',
    hi: 'कैटलॉग से चुनें — यूनिट और रेट अपने आप भर जाएँगे।',
    mr: 'कॅटलॉगमधून निवडा — युनिट आणि रेट आपोआप भरले जातील.',
  },
  'start.customerTitle': { en: 'Add a customer', hi: 'एक ग्राहक जोड़ें', mr: 'एक ग्राहक जोडा' },
  'start.customerHint': {
    en: 'A name and phone number are enough to start.',
    hi: 'शुरू करने के लिए नाम और फ़ोन नंबर काफ़ी है।',
    mr: 'सुरुवातीला नाव आणि फोन नंबर पुरेसे आहेत.',
  },
  'start.billTitle': { en: 'Make your first bill', hi: 'अपना पहला बिल बनाएँ', mr: 'तुमचे पहिले बिल बनवा' },
  'start.billHint': {
    en: 'Then send it straight to the customer on WhatsApp.',
    hi: 'फिर सीधे ग्राहक को WhatsApp पर भेजें।',
    mr: 'मग थेट ग्राहकाला WhatsApp वर पाठवा.',
  },
  // "{items}" is a list built from the item keys below and joined with
  // start.and. Every item is grammatically masculine in both Hindi and
  // Marathi, which is what lets one अपना / तुमचा cover any combination.
  'start.letterhead': {
    en: 'Put your {items} on every bill.',
    hi: 'हर बिल पर अपना {items} छापें।',
    mr: 'प्रत्येक बिलावर तुमचा {items} छापा.',
  },
  'start.itemLogo': { en: 'logo', hi: 'लोगो', mr: 'लोगो' },
  'start.itemAddress': { en: 'address', hi: 'पता', mr: 'पत्ता' },
  'start.itemPhone': { en: 'phone number', hi: 'फ़ोन नंबर', mr: 'फोन नंबर' },
  'start.itemGst': { en: 'GST number (if you have one)', hi: 'GST नंबर (अगर है तो)', mr: 'GST नंबर (असल्यास)' },
  'start.and': { en: 'and', hi: 'और', mr: 'आणि' },
  'start.skip': { en: 'Skip for now', hi: 'अभी के लिए छोड़ें', mr: 'सध्या वगळा' },

  // ── Unfinished bills and estimates (lib/drafts.ts) ────────────────────
  'draft.billTitle': { en: 'Unsaved bill found', hi: 'अधूरा बिल मिला', mr: 'अपूर्ण बिल सापडले' },
  'draft.estimateTitle': { en: 'Unsaved estimate found', hi: 'अधूरा कोटेशन मिला', mr: 'अपूर्ण कोटेशन सापडले' },
  'draft.ask': {
    en: 'This was not saved. Continue where you left off?',
    hi: 'यह सेव नहीं हुआ था। जहाँ छोड़ा था वहीं से जारी रखें?',
    mr: 'हे सेव्ह झाले नव्हते. जिथे सोडले तिथून पुढे चालू ठेवायचे?',
  },
  'draft.savedAt': { en: 'Last changed {when}', hi: 'आखिरी बदलाव {when}', mr: 'शेवटचा बदल {when}' },
  'draft.continue': { en: 'Continue', hi: 'जारी रखें', mr: 'पुढे चालू ठेवा' },
  'draft.discard': { en: 'Discard', hi: 'हटा दें', mr: 'काढून टाका' },
  'draft.noCustomer': { en: 'No customer picked', hi: 'ग्राहक नहीं चुना', mr: 'ग्राहक निवडला नाही' },
  'draft.itemOne': { en: '1 item', hi: '1 माल', mr: '1 माल' },
  'draft.itemMany': { en: '{count} items', hi: '{count} माल', mr: '{count} माल' },
  'draft.bannerBill': { en: 'Unsaved bill', hi: 'अधूरा बिल', mr: 'अपूर्ण बिल' },
  'draft.bannerEstimate': { en: 'Unsaved estimate', hi: 'अधूरा कोटेशन', mr: 'अपूर्ण कोटेशन' },
  'draft.continueArrow': { en: 'Continue →', hi: 'जारी रखें →', mr: 'पुढे चला →' },

  // ── Errors ────────────────────────────────────────────────────────────
  // These were hardcoded English on supplier screens, so a supplier working
  // in Hindi hit an English wall the moment anything went wrong.
  'error.generic': {
    en: 'Something went wrong. Please try again.',
    hi: 'कुछ गड़बड़ हो गई। दोबारा कोशिश करें।',
    mr: 'काहीतरी चूक झाली. पुन्हा प्रयत्न करा.',
  },
  'error.phone10': {
    en: 'Phone number must be exactly 10 digits.',
    hi: 'फ़ोन नंबर पूरे 10 अंकों का होना चाहिए।',
    mr: 'फोन नंबर पूर्ण 10 अंकी असावा.',
  },

  // ── Customer order page (public, /order/<link>) ─────────────────────
  'order.title': { en: 'Order materials', hi: 'सामान ऑर्डर करें', mr: 'साहित्य ऑर्डर करा' },
  'order.intro': {
    en: 'Choose what you need and send your order. {business} will check it and confirm the final order.',
    hi: 'जो चाहिए वह चुनें और ऑर्डर भेजें। {business} इसे देखकर अंतिम ऑर्डर पक्का करेंगे।',
    mr: 'हवे ते निवडा आणि ऑर्डर पाठवा. {business} ते तपासून अंतिम ऑर्डर निश्चित करतील.',
  },
  'order.pricesNote': {
    en: 'Prices are indicative. Final price will be confirmed by the supplier.',
    hi: 'दाम अंदाज़न हैं। अंतिम दाम सप्लायर पक्का करेंगे।',
    mr: 'दर अंदाजे आहेत. अंतिम दर सप्लायर निश्चित करतील.',
  },
  'order.priceOnRequest': { en: 'Price on request', hi: 'दाम पूछें', mr: 'दर विचारा' },
  'order.search': { en: 'Search materials…', hi: 'सामान खोजें…', mr: 'साहित्य शोधा…' },
  'order.noMaterials': { en: 'No materials are listed yet.', hi: 'अभी कोई सामान नहीं है।', mr: 'अजून कोणतेही साहित्य नाही.' },
  'order.less': { en: 'Less {name}', hi: '{name} कम करें', mr: '{name} कमी करा' },
  'order.more': { en: 'More {name}', hi: '{name} बढ़ाएँ', mr: '{name} वाढवा' },
  'order.qtyOf': { en: 'Quantity of {name}', hi: '{name} की मात्रा', mr: '{name} ची मात्रा' },
  'order.selectedCount': { en: '{count} selected', hi: '{count} चुने गए', mr: '{count} निवडले' },
  'order.yourDetails': { en: 'Your details', hi: 'आपकी जानकारी', mr: 'तुमची माहिती' },
  // The summary between the materials and the form: what is being added, and
  // what it is likely to come to.
  'order.summaryTitle': {
    en: 'What you are ordering',
    hi: 'आप क्या ऑर्डर कर रहे हैं',
    mr: 'तुम्ही काय ऑर्डर करत आहात',
  },
  'order.estimatedLabel': { en: 'Estimated total', hi: 'अंदाज़न कुल', mr: 'अंदाजे एकूण' },
  'order.estimatedNote': {
    en: 'An estimate, not the final price.',
    hi: 'यह अंदाज़ा है, अंतिम दाम नहीं।',
    mr: 'हा अंदाज आहे, अंतिम दर नाही.',
  },
  'order.name': { en: 'Your name', hi: 'आपका नाम', mr: 'तुमचे नाव' },
  'order.phone': { en: 'Mobile number', hi: 'मोबाइल नंबर', mr: 'मोबाईल नंबर' },
  'order.site': { en: 'Site / delivery address', hi: 'साइट / डिलीवरी पता', mr: 'साईट / डिलिव्हरीचा पत्ता' },
  'order.date': { en: 'Delivery date (optional)', hi: 'डिलीवरी की तारीख (वैकल्पिक)', mr: 'डिलिव्हरीची तारीख (ऐच्छिक)' },
  'order.note': { en: 'Note for the supplier (optional)', hi: 'सप्लायर के लिए नोट (वैकल्पिक)', mr: 'सप्लायरसाठी नोट (ऐच्छिक)' },
  'order.notePlaceholder': { en: 'e.g. Deliver before 10 am', hi: 'जैसे: सुबह 10 बजे से पहले भेजें', mr: 'उदा. सकाळी 10 च्या आधी पाठवा' },
  'order.place': { en: 'Place order', hi: 'ऑर्डर भेजें', mr: 'ऑर्डर पाठवा' },
  // The button the whole order box folds into.
  'order.startNow': {
    en: 'Order materials now',
    hi: 'अभी सामान ऑर्डर करें',
    mr: 'आता साहित्य ऑर्डर करा',
  },
  // The button at the end of the order box names the shop: the customer
  // came in on a shared link and should see who the order goes to.
  'order.placeAt': {
    en: 'Place order at {business}',
    hi: '{business} को ऑर्डर भेजें',
    mr: '{business} ला ऑर्डर पाठवा',
  },
  'order.placing': { en: 'Sending…', hi: 'भेज रहे हैं…', mr: 'पाठवत आहे…' },
  'order.pickSomething': { en: 'Add at least one material.', hi: 'कम से कम एक सामान जोड़ें।', mr: 'किमान एक साहित्य जोडा.' },
  'order.nameInvalid': { en: 'Please enter your name.', hi: 'कृपया अपना नाम लिखें।', mr: 'कृपया तुमचे नाव लिहा.' },
  'order.phoneInvalid': {
    en: 'Please enter a 10-digit mobile number.',
    hi: 'कृपया 10 अंकों का मोबाइल नंबर लिखें।',
    mr: 'कृपया 10 अंकी मोबाईल नंबर लिहा.',
  },
  'order.dateInvalid': {
    en: 'Please choose a delivery date within the next 90 days.',
    hi: 'कृपया अगले 90 दिनों में की तारीख चुनें।',
    mr: 'कृपया पुढील 90 दिवसांतील तारीख निवडा.',
  },
  'order.tooManyWaiting': {
    en: 'You already have orders waiting with this supplier. Please call them instead.',
    hi: 'इस सप्लायर के पास आपके ऑर्डर पहले से रुके हैं। कृपया उन्हें फ़ोन करें।',
    mr: 'या सप्लायरकडे तुमच्या ऑर्डर आधीच प्रलंबित आहेत. कृपया त्यांना फोन करा.',
  },
  // One phone or computer over its hourly limit (migration 032).
  'order.deviceBusy': {
    en: 'Too many orders from this phone just now. Please try again later, or call the shop.',
    hi: 'इस फ़ोन से अभी बहुत ऑर्डर आए हैं। थोड़ी देर बाद कोशिश करें, या दुकान पर फ़ोन करें।',
    mr: 'या फोनवरून आत्ता खूप ऑर्डर आल्या आहेत. थोड्या वेळाने प्रयत्न करा, किंवा दुकानात फोन करा.',
  },
  // Blocking a number from an order's page (migration 032).
  'ord.block': { en: 'Block this number', hi: 'यह नंबर ब्लॉक करें', mr: 'हा नंबर ब्लॉक करा' },
  'ord.blockTitle': { en: 'Block {phone}?', hi: '{phone} ब्लॉक करें?', mr: '{phone} ब्लॉक करायचा?' },
  'ord.blockBody': {
    en: 'Orders from this number will be refused — the sender isn’t told. Its orders still waiting are rejected. You can unblock it any time in Settings → Online orders.',
    hi: 'इस नंबर से आने वाले ऑर्डर अपने-आप नामंज़ूर होंगे — भेजने वाले को पता नहीं चलेगा। इसके रुके हुए ऑर्डर भी नामंज़ूर हो जाएँगे। सेटिंग → ऑनलाइन ऑर्डर में कभी भी अनब्लॉक कर सकते हैं।',
    mr: 'या नंबरवरून येणाऱ्या ऑर्डर आपोआप नाकारल्या जातील — पाठवणाऱ्याला कळणार नाही. त्याच्या प्रलंबित ऑर्डरही नाकारल्या जातील. सेटिंग → ऑनलाइन ऑर्डरमध्ये कधीही अनब्लॉक करू शकता.',
  },
  'ord.blockConfirm': { en: 'Block number', hi: 'नंबर ब्लॉक करें', mr: 'नंबर ब्लॉक करा' },
  'ord.blocked': { en: 'This number is blocked — its orders are refused.', hi: 'यह नंबर ब्लॉक है — इसके ऑर्डर नामंज़ूर होते हैं।', mr: 'हा नंबर ब्लॉक आहे — त्याच्या ऑर्डर नाकारल्या जातात.' },
  'ord.unblock': { en: 'Unblock', hi: 'अनब्लॉक', mr: 'अनब्लॉक' },
  'ord.blockedTitle': { en: 'Blocked numbers', hi: 'ब्लॉक किए नंबर', mr: 'ब्लॉक केलेले नंबर' },
  'ord.blockedHint': {
    en: 'Orders from these numbers are refused. Unblock one to take its orders again.',
    hi: 'इन नंबरों के ऑर्डर नामंज़ूर होते हैं। अनब्लॉक करने पर फिर से ऑर्डर आएँगे।',
    mr: 'या नंबरच्या ऑर्डर नाकारल्या जातात. अनब्लॉक केल्यावर पुन्हा ऑर्डर येतील.',
  },
  'order.busy': {
    en: 'Too many orders right now. Please try again in a while.',
    hi: 'अभी बहुत ऑर्डर आ रहे हैं। थोड़ी देर बाद कोशिश करें।',
    mr: 'आत्ता खूप ऑर्डर येत आहेत. थोड्या वेळाने प्रयत्न करा.',
  },
  'order.sentTitle': { en: 'Order request sent', hi: 'ऑर्डर अनुरोध भेज दिया', mr: 'ऑर्डर विनंती पाठवली' },
  'order.sentBody': {
    en: 'Your order request has been sent to {business}. They will review it and confirm the final order.',
    hi: 'आपका ऑर्डर अनुरोध {business} को भेज दिया गया है। वे इसे देखकर अंतिम ऑर्डर पक्का करेंगे।',
    mr: 'तुमची ऑर्डर विनंती {business} यांना पाठवली आहे. ते ती तपासून अंतिम ऑर्डर निश्चित करतील.',
  },
  'order.keepLink': {
    en: 'Keep this link to check your order status:',
    hi: 'ऑर्डर की स्थिति देखने के लिए यह लिंक रखें:',
    mr: 'ऑर्डरची स्थिती पाहण्यासाठी ही लिंक जपून ठेवा:',
  },
  'order.copyLink': { en: 'Copy link', hi: 'लिंक कॉपी करें', mr: 'लिंक कॉपी करा' },
  'order.copied': { en: 'Copied', hi: 'कॉपी हो गया', mr: 'कॉपी झाली' },
  'order.viewStatus': { en: 'View status', hi: 'स्थिति देखें', mr: 'स्थिती पहा' },
  'order.another': { en: 'Place another order', hi: 'एक और ऑर्डर भेजें', mr: 'आणखी एक ऑर्डर पाठवा' },
  'order.unavailable': {
    en: 'Online ordering is currently unavailable.',
    hi: 'ऑनलाइन ऑर्डर अभी उपलब्ध नहीं है।',
    mr: 'ऑनलाइन ऑर्डर सध्या उपलब्ध नाही.',
  },
  'order.notFound': { en: 'This order link is not valid.', hi: 'यह ऑर्डर लिंक सही नहीं है।', mr: 'ही ऑर्डर लिंक योग्य नाही.' },
  'order.recent': { en: 'Your recent orders', hi: 'आपके हाल के ऑर्डर', mr: 'तुमच्या अलीकडील ऑर्डर' },
  'order.againTitle': { en: 'Order the same again?', hi: 'वही ऑर्डर फिर से?', mr: 'तीच ऑर्डर पुन्हा?' },
  'order.againHint': {
    en: 'The materials and quantities from your last order ({count}).',
    hi: 'आपके पिछले ऑर्डर का सामान और मात्रा ({count})।',
    mr: 'तुमच्या मागच्या ऑर्डरचे साहित्य आणि मात्रा ({count}).',
  },
  'order.againMissing': {
    en: 'Some are no longer listed and are left out.',
    hi: 'कुछ सामान अब नहीं मिलता, वह छोड़ दिया गया है।',
    mr: 'काही साहित्य आता उपलब्ध नाही, ते वगळले आहे.',
  },
  'order.againButton': { en: 'Fill in my last order', hi: 'पिछला ऑर्डर भरें', mr: 'मागची ऑर्डर भरा' },
  // The estimate on the customer's status link (migration 030)…
  'est.title': { en: 'Your estimate {no}', hi: 'आपका एस्टिमेट {no}', mr: 'तुमचे एस्टिमेट {no}' },
  'est.subtotal': { en: 'Subtotal', hi: 'उप-योग', mr: 'उप-एकूण' },
  'est.transport': { en: 'Transport + labour', hi: 'ढुलाई + मज़दूरी', mr: 'वाहतूक + मजुरी' },
  'est.total': { en: 'Total', hi: 'कुल', mr: 'एकूण' },
  'est.askHint': {
    en: 'Happy with it? Tap Accept and {business} will prepare your bill — or ask them to call you.',
    hi: 'ठीक लगे तो मंज़ूर करें, {business} आपका बिल बनाएँगे — या उन्हें कॉल करने को कहें।',
    mr: 'पटले तर मंजूर करा, {business} तुमचे बिल बनवतील — किंवा त्यांना कॉल करायला सांगा.',
  },
  'est.accept': { en: 'Accept estimate', hi: 'एस्टिमेट मंज़ूर करें', mr: 'एस्टिमेट मंजूर करा' },
  'est.callMe': { en: 'Please call me', hi: 'मुझे कॉल करें', mr: 'मला कॉल करा' },
  'est.accepted': {
    en: 'You accepted this estimate on {date}.',
    hi: 'आपने {date} को यह एस्टिमेट मंज़ूर किया।',
    mr: 'तुम्ही {date} रोजी हे एस्टिमेट मंजूर केले.',
  },
  'est.calledFor': {
    en: 'You asked {business} to call you ({date}).',
    hi: 'आपने {business} से कॉल करने को कहा ({date})।',
    mr: 'तुम्ही {business} यांना कॉल करायला सांगितले ({date}).',
  },
  'est.converted': { en: 'This estimate has been turned into a bill.', hi: 'इस एस्टिमेट का बिल बन चुका है।', mr: 'या एस्टिमेटचे बिल झाले आहे.' },
  'est.expired': {
    en: 'This estimate has expired. Please contact {business}.',
    hi: 'यह एस्टिमेट पुराना हो गया है। कृपया {business} से संपर्क करें।',
    mr: 'हे एस्टिमेट जुने झाले आहे. कृपया {business} यांच्याशी संपर्क साधा.',
  },
  // …and the answer on the supplier's screens.
  'est.customerAccepted': { en: 'Customer accepted', hi: 'ग्राहक ने मंज़ूर किया', mr: 'ग्राहकाने मंजूर केले' },
  'est.customerCallMe': { en: 'Customer asked you to call', hi: 'ग्राहक ने कॉल करने को कहा', mr: 'ग्राहकाने कॉल करायला सांगितले' },
  'dash.acceptedOne': { en: 'A customer accepted an estimate', hi: 'एक ग्राहक ने एस्टिमेट मंज़ूर किया', mr: 'एका ग्राहकाने एस्टिमेट मंजूर केले' },
  'dash.acceptedMany': {
    en: '{count} customers accepted estimates',
    hi: '{count} ग्राहकों ने एस्टिमेट मंज़ूर किए',
    mr: '{count} ग्राहकांनी एस्टिमेट मंजूर केले',
  },
  'dash.convertNow': { en: 'Make the bill →', hi: 'बिल बनाएँ →', mr: 'बिल बनवा →' },
  // "Material received" on the khata link (migration 030).
  'khata.receivedAsk': { en: 'Material received?', hi: 'माल मिल गया?', mr: 'माल मिळाला?' },
  'khata.receivedYes': { en: 'Yes, received', hi: 'हाँ, मिल गया', mr: 'हो, मिळाला' },
  'khata.receivedOn': { en: 'Received ✓ {date}', hi: 'मिल गया ✓ {date}', mr: 'मिळाला ✓ {date}' },
  'inv.customerReceived': {
    en: 'Customer confirmed received on {date}',
    hi: 'ग्राहक ने {date} को माल मिलने की पुष्टि की',
    mr: 'ग्राहकाने {date} रोजी माल मिळाल्याची खात्री केली',
  },
  'order.statusTitle': { en: 'Order status', hi: 'ऑर्डर की स्थिति', mr: 'ऑर्डरची स्थिती' },
  'order.status.pending': { en: 'Waiting for review', hi: 'देखे जाने की प्रतीक्षा', mr: 'तपासणीची प्रतीक्षा' },
  'order.status.pendingBody': {
    en: '{business} has your order request and will confirm it soon.',
    hi: '{business} के पास आपका ऑर्डर अनुरोध है, वे जल्द पक्का करेंगे।',
    mr: '{business} यांच्याकडे तुमची ऑर्डर विनंती आहे, ते लवकरच निश्चित करतील.',
  },
  // "Estimate ready", not "Accepted": the customer is the one who accepts,
  // with the button under the estimate — two "accepts" read as a question.
  'order.status.approved': { en: 'Estimate ready', hi: 'एस्टिमेट तैयार', mr: 'एस्टिमेट तयार' },
  'order.status.approvedBody': {
    en: '{business} has prepared an estimate for your order — see it below.',
    hi: '{business} ने आपके ऑर्डर का एस्टिमेट बना दिया है — नीचे देखें।',
    mr: '{business} यांनी तुमच्या ऑर्डरचे एस्टिमेट तयार केले आहे — खाली पाहा.',
  },
  'order.status.rejected': { en: 'Not accepted', hi: 'स्वीकार नहीं', mr: 'स्वीकारली नाही' },
  'order.status.rejectedBody': {
    en: '{business} could not accept this order. Please contact them directly.',
    hi: '{business} यह ऑर्डर स्वीकार नहीं कर सके। कृपया उनसे सीधे बात करें।',
    mr: '{business} ही ऑर्डर स्वीकारू शकले नाहीत. कृपया त्यांच्याशी थेट बोला.',
  },
  'order.placedOn': { en: 'Placed on {date}', hi: '{date} को भेजा', mr: '{date} रोजी पाठवली' },
  'order.deliveryOn': { en: 'Delivery wanted: {date}', hi: 'डिलीवरी चाहिए: {date}', mr: 'डिलिव्हरी हवी: {date}' },
  'order.statusNotFound': { en: 'We could not find this order.', hi: 'यह ऑर्डर नहीं मिला।', mr: 'ही ऑर्डर सापडली नाही.' },

  // ── Online orders, the supplier's side ────────────────────────────
  'nav.orders': { en: 'Orders', hi: 'ऑर्डर', mr: 'ऑर्डर' },
  'ord.title': { en: 'Online orders', hi: 'ऑनलाइन ऑर्डर', mr: 'ऑनलाइन ऑर्डर' },
  'ord.subtitle': {
    en: 'Orders customers sent from your order link',
    hi: 'आपके ऑर्डर लिंक से आए ऑर्डर',
    mr: 'तुमच्या ऑर्डर लिंकवरून आलेल्या ऑर्डर',
  },
  'ord.tab.pending': { en: 'New', hi: 'नए', mr: 'नवीन' },
  'ord.tab.approved': { en: 'Approved', hi: 'स्वीकार किए', mr: 'स्वीकारलेल्या' },
  'ord.tab.rejected': { en: 'Rejected', hi: 'नामंज़ूर', mr: 'नाकारलेल्या' },
  'ord.emptyPending': {
    en: 'No new orders. Share your order link with customers to start receiving them.',
    hi: 'कोई नया ऑर्डर नहीं। ऑर्डर पाने के लिए ग्राहकों को अपना ऑर्डर लिंक भेजें।',
    mr: 'नवीन ऑर्डर नाहीत. ऑर्डर मिळवण्यासाठी ग्राहकांना तुमची ऑर्डर लिंक पाठवा.',
  },
  'ord.emptyOther': { en: 'Nothing here yet.', hi: 'अभी यहाँ कुछ नहीं।', mr: 'अजून इथे काही नाही.' },
  'ord.existingCustomer': { en: 'Existing customer', hi: 'पुराना ग्राहक', mr: 'जुना ग्राहक' },
  'ord.newCustomer': { en: 'New customer', hi: 'नया ग्राहक', mr: 'नवीन ग्राहक' },
  'ord.moreItems': { en: '+{count} more', hi: '+{count} और', mr: '+{count} आणखी' },
  'ord.approve': { en: 'Approve', hi: 'स्वीकार करें', mr: 'स्वीकारा' },
  'ord.reject': { en: 'Reject', hi: 'नामंज़ूर करें', mr: 'नाकारा' },
  'ord.received': { en: 'Received {date}', hi: '{date} को आया', mr: '{date} रोजी आली' },
  'ord.possibleMatch': {
    en: 'Possible match: {name} (same phone number)',
    hi: 'संभावित ग्राहक: {name} (वही फ़ोन नंबर)',
    mr: 'संभाव्य ग्राहक: {name} (तोच फोन नंबर)',
  },
  'ord.newCustomerNote': {
    en: 'Not in your customers yet. They will be added only when you approve.',
    hi: 'अभी आपके ग्राहकों में नहीं हैं। स्वीकार करने पर ही जोड़े जाएँगे।',
    mr: 'अजून तुमच्या ग्राहकांमध्ये नाहीत. स्वीकारल्यावरच जोडले जातील.',
  },
  'ord.approveHint': {
    en: 'Approve opens an estimate at your current rates. Change quantities there before saving.',
    hi: 'स्वीकार करने पर आपके मौजूदा दामों पर एस्टिमेट खुलेगा। सेव करने से पहले मात्रा बदल सकते हैं।',
    mr: 'स्वीकारल्यावर तुमच्या सध्याच्या दरांवर एस्टिमेट उघडेल. सेव्ह करण्यापूर्वी मात्रा बदलू शकता.',
  },
  'ord.openEstimate': { en: 'Open estimate', hi: 'एस्टिमेट खोलें', mr: 'एस्टिमेट उघडा' },
  'ord.rejectedReason': { en: 'Reason: {reason}', hi: 'कारण: {reason}', mr: 'कारण: {reason}' },
  'ord.rejectTitle': { en: 'Reject this order?', hi: 'यह ऑर्डर नामंज़ूर करें?', mr: 'ही ऑर्डर नाकारायची?' },
  'ord.rejectReason': { en: 'Reason — the customer will see this', hi: 'कारण — ग्राहक को दिखेगा', mr: 'कारण — ग्राहकाला दिसेल' },
  'ord.rejectChoose': { en: 'Choose a reason…', hi: 'कारण चुनें…', mr: 'कारण निवडा…' },
  'ord.rejectReasonPlaceholder': {
    en: 'Write the reason for the customer',
    hi: 'ग्राहक के लिए कारण लिखें',
    mr: 'ग्राहकासाठी कारण लिहा',
  },
  'ord.rejectNote': {
    en: 'The customer sees this reason on their order status link. No message is sent automatically, and nothing else changes.',
    hi: 'ग्राहक को यह कारण अपने ऑर्डर स्टेटस लिंक पर दिखेगा। अपने-आप कोई मैसेज नहीं जाता, और कुछ और नहीं बदलता।',
    mr: 'ग्राहकाला हे कारण त्याच्या ऑर्डर स्टेटस लिंकवर दिसेल. आपोआप कोणताही मेसेज जात नाही, आणि इतर काहीही बदलत नाही.',
  },
  // Reject reasons (migration 027). Read by the supplier and, on the status
  // link, by the customer — so they are written to the customer.
  'rejectCode.no_stock': { en: 'Material not in stock right now', hi: 'सामान अभी स्टॉक में नहीं है', mr: 'साहित्य सध्या स्टॉकमध्ये नाही' },
  'rejectCode.too_many_orders': {
    en: 'Too many orders right now — please try again later',
    hi: 'अभी बहुत ऑर्डर हैं — कृपया बाद में फिर कोशिश करें',
    mr: 'सध्या खूप ऑर्डर आहेत — कृपया नंतर पुन्हा प्रयत्न करा',
  },
  'rejectCode.area_not_served': { en: 'We don’t deliver to this area', hi: 'हम इस इलाके में डिलीवरी नहीं करते', mr: 'आम्ही या भागात डिलिव्हरी करत नाही' },
  'rejectCode.date_not_possible': {
    en: 'Can’t deliver on the date you asked for',
    hi: 'आपकी बताई तारीख पर डिलीवरी नहीं हो सकती',
    mr: 'तुम्ही सांगितलेल्या तारखेला डिलिव्हरी शक्य नाही',
  },
  'rejectCode.other': { en: 'Other reason', hi: 'दूसरा कारण', mr: 'इतर कारण' },
  // Khata link (migration 028): the supplier's side…
  'khata.share': { en: 'Share khata link', hi: 'खाता लिंक भेजें', mr: 'खाते लिंक पाठवा' },
  'khata.title': { en: 'Khata link', hi: 'खाता लिंक', mr: 'खाते लिंक' },
  'khata.hint': {
    en: '{name} can open this link any time to see their bills, payments and balance. It is read-only — nothing can be changed from it.',
    hi: '{name} यह लिंक कभी भी खोलकर अपने बिल, भुगतान और बकाया देख सकते हैं। यह सिर्फ़ देखने के लिए है — इससे कुछ बदला नहीं जा सकता।',
    mr: '{name} ही लिंक कधीही उघडून आपली बिले, पेमेंट आणि बाकी पाहू शकतात. ही फक्त पाहण्यासाठी आहे — यातून काहीही बदलता येत नाही.',
  },
  'khata.whatsapp': { en: 'Send on WhatsApp', hi: 'WhatsApp पर भेजें', mr: 'WhatsApp वर पाठवा' },
  'khata.stop': { en: 'Stop this link', hi: 'यह लिंक बंद करें', mr: 'ही लिंक बंद करा' },
  'khata.stopHint': {
    en: 'The link stops working at once. You can make a new one any time.',
    hi: 'लिंक तुरंत काम करना बंद कर देगा। आप कभी भी नया लिंक बना सकते हैं।',
    mr: 'लिंक लगेच बंद होईल. तुम्ही कधीही नवीन लिंक बनवू शकता.',
  },
  'khata.stopped': {
    en: 'The link is stopped. The old one no longer opens.',
    hi: 'लिंक बंद हो गया। पुराना लिंक अब नहीं खुलेगा।',
    mr: 'लिंक बंद झाली. जुनी लिंक आता उघडणार नाही.',
  },
  'khata.makeNew': { en: 'Make a new link', hi: 'नया लिंक बनाएँ', mr: 'नवीन लिंक बनवा' },
  'khata.message': {
    en: 'Hi {name}, you can see your account with {business} — every bill, payment and your balance — any time here: {url}',
    hi: 'नमस्ते {name}, {business} के साथ अपना खाता — हर बिल, भुगतान और बकाया — यहाँ कभी भी देखें: {url}',
    mr: 'नमस्कार {name}, {business} कडील तुमचे खाते — प्रत्येक बिल, पेमेंट आणि बाकी — इथे कधीही पाहा: {url}',
  },
  // …and the customer's page.
  'khata.pageTitle': { en: 'Account statement', hi: 'खाता विवरण', mr: 'खाते विवरण' },
  'khata.for': { en: 'Statement for {name}', hi: '{name} का खाता', mr: '{name} यांचे खाते' },
  'khata.due': { en: 'Balance due', hi: 'बकाया', mr: 'बाकी' },
  'khata.youOwe': { en: 'You owe', hi: 'आपको देना है', mr: 'तुम्हाला द्यायचे आहे' },
  'khata.netNote': {
    en: '{bills} on your bills, less {advance} advance with us.',
    hi: 'बिलों पर {bills}, उसमें से {advance} जमा घटाया गया।',
    mr: 'बिलांवर {bills}, त्यातून {advance} जमा वजा केले.',
  },
  'khata.advance': { en: 'Advance with us', hi: 'हमारे पास जमा', mr: 'आमच्याकडे जमा' },
  'khata.settled': { en: 'Your account is fully settled. Thank you!', hi: 'आपका खाता पूरा साफ़ है। धन्यवाद!', mr: 'तुमचे खाते पूर्ण साफ आहे. धन्यवाद!' },
  'khata.download': { en: 'Download PDF', hi: 'PDF डाउनलोड करें', mr: 'PDF डाउनलोड करा' },
  'khata.call': { en: 'Call', hi: 'कॉल करें', mr: 'कॉल करा' },
  'khata.history': { en: 'Bills and payments', hi: 'बिल और भुगतान', mr: 'बिले आणि पेमेंट' },
  'khata.none': { en: 'No bills or payments yet.', hi: 'अभी कोई बिल या भुगतान नहीं।', mr: 'अजून कोणतेही बिल किंवा पेमेंट नाही.' },
  'khata.showOlder': { en: 'Show older ({count})', hi: 'पुराने देखें ({count})', mr: 'जुने पाहा ({count})' },
  'khata.bill': { en: 'Bill {no}', hi: 'बिल {no}', mr: 'बिल {no}' },
  'khata.opening': { en: 'Old balance', hi: 'पुराना बकाया', mr: 'जुनी बाकी' },
  'khata.payment': { en: 'Payment · {mode}', hi: 'भुगतान · {mode}', mr: 'पेमेंट · {mode}' },
  'khata.paidFor': { en: 'for {refs}', hi: '{refs} के लिए', mr: '{refs} साठी' },
  'khata.advanceReceived': { en: 'kept as advance', hi: 'जमा के रूप में रखा', mr: 'जमा म्हणून ठेवले' },
  'khata.runningDue': { en: 'Due {amount}', hi: 'बकाया {amount}', mr: 'बाकी {amount}' },
  'khata.runningAdvance': { en: 'Advance {amount}', hi: 'जमा {amount}', mr: 'जमा {amount}' },
  // Install app — the More sheet's tile, and the iPhone steps.
  'install.tile': { en: 'Install app', hi: 'ऐप इंस्टॉल', mr: 'ॲप इंस्टॉल' },
  'install.title': { en: 'Put BuildSupply on your home screen', hi: 'BuildSupply को होम स्क्रीन पर रखें', mr: 'BuildSupply होम स्क्रीनवर ठेवा' },
  'install.ios1': { en: 'In Safari, tap the Share button', hi: 'Safari में Share बटन दबाएँ', mr: 'Safari मध्ये Share बटण दाबा' },
  'install.ios2': { en: 'Choose “Add to Home Screen”', hi: '“Add to Home Screen” चुनें', mr: '“Add to Home Screen” निवडा' },
  'install.ios3': {
    en: 'Tap Add — BuildSupply then opens from its own icon, like an app.',
    hi: 'Add दबाएँ — फिर BuildSupply अपने आइकन से ऐप की तरह खुलेगा।',
    mr: 'Add दाबा — मग BuildSupply स्वतःच्या आयकॉनवरून ॲपसारखे उघडेल.',
  },
  // Send to driver — the driver's WhatsApp chat with one delivery (migration 031).
  'drv.menu': { en: 'Send to driver', hi: 'ड्राइवर को भेजें', mr: 'ड्रायव्हरला पाठवा' },
  'drv.title': { en: 'Send to driver', hi: 'ड्राइवर को भेजें', mr: 'ड्रायव्हरला पाठवा' },
  'drv.hint': {
    en: 'Tap a driver: WhatsApp opens their chat with {no} written out — customer, site, materials and a map link. You press Send.',
    hi: 'ड्राइवर चुनें: WhatsApp में उनकी चैट खुलेगी, {no} लिखा हुआ — ग्राहक, साइट, माल और नक्शे का लिंक। भेजें आप दबाएँ।',
    mr: 'ड्रायव्हर निवडा: WhatsApp मध्ये त्यांची चॅट उघडेल, {no} लिहिलेले — ग्राहक, साइट, माल आणि नकाशाची लिंक. पाठवा तुम्ही दाबा.',
  },
  'drv.none': { en: 'No drivers saved yet.', hi: 'अभी कोई ड्राइवर सेव नहीं।', mr: 'अजून कोणताही ड्रायव्हर सेव्ह नाही.' },
  'drv.add': { en: '+ Add a driver', hi: '+ ड्राइवर जोड़ें', mr: '+ ड्रायव्हर जोडा' },
  'drv.name': { en: 'Driver’s name', hi: 'ड्राइवर का नाम', mr: 'ड्रायव्हरचे नाव' },
  'drv.phone': { en: 'WhatsApp number', hi: 'WhatsApp नंबर', mr: 'WhatsApp नंबर' },
  'drv.save': { en: 'Save driver', hi: 'ड्राइवर सेव करें', mr: 'ड्रायव्हर सेव्ह करा' },
  'drv.remove': { en: 'Remove {name}', hi: '{name} हटाएँ', mr: '{name} काढा' },
  'drv.exists': { en: 'This number is already in your drivers.', hi: 'यह नंबर पहले से आपके ड्राइवरों में है।', mr: 'हा नंबर आधीच तुमच्या ड्रायव्हरमध्ये आहे.' },
  'drv.invalid': { en: 'Enter a name and a 10-digit number.', hi: 'नाम और 10 अंकों का नंबर डालें।', mr: 'नाव आणि 10 अंकी नंबर टाका.' },
  'drv.other': { en: 'Pick someone else in WhatsApp', hi: 'WhatsApp में किसी और को चुनें', mr: 'WhatsApp मध्ये दुसरे कोणी निवडा' },
  'drv.msgTitle': { en: 'Delivery from {business} — bill {no}', hi: '{business} से डिलीवरी — बिल {no}', mr: '{business} कडून डिलिव्हरी — बिल {no}' },
  'drv.msgCustomer': { en: 'Customer: {name}', hi: 'ग्राहक: {name}', mr: 'ग्राहक: {name}' },
  'drv.msgPhone': { en: 'Phone: {phone}', hi: 'फ़ोन: {phone}', mr: 'फोन: {phone}' },
  'drv.msgSite': { en: 'Site: {site}', hi: 'साइट: {site}', mr: 'साइट: {site}' },
  'drv.msgAddress': { en: 'Address: {address}', hi: 'पता: {address}', mr: 'पत्ता: {address}' },
  'drv.msgMaterials': { en: 'Materials:', hi: 'माल:', mr: 'माल:' },
  'drv.msgNote': { en: 'Customer’s note: {note}', hi: 'ग्राहक का नोट: {note}', mr: 'ग्राहकाची नोंद: {note}' },
  'drv.msgWanted': { en: 'Wanted on: {date}', hi: 'चाहिए: {date}', mr: 'हवे: {date}' },
  'drv.msgMap': { en: 'Map: {url}', hi: 'नक्शा: {url}', mr: 'नकाशा: {url}' },
  // Profile: the order QR button under the business name.
  'set.orderQr': { en: 'Order QR', hi: 'ऑर्डर QR', mr: 'ऑर्डर QR' },
  // The customer's links remembered on their phone (lib/customerLinks).
  'order.myKhata': { en: 'My khata', hi: 'मेरा खाता', mr: 'माझे खाते' },
  'order.myKhataHint': {
    en: 'Your bills, payments and balance with {business}',
    hi: '{business} के साथ आपके बिल, भुगतान और बकाया',
    mr: '{business} सोबतची तुमची बिले, पेमेंट आणि बाकी',
  },
  'order.orderMore': { en: 'Order more materials', hi: 'और माल मँगाएँ', mr: 'अजून माल मागवा' },
  'khata.orderMaterials': { en: 'Order materials', hi: 'माल मँगाएँ', mr: 'माल मागवा' },
  // The khata link's menu: one row per thing a customer comes here for.
  'khata.menuPay': { en: 'Pay now', hi: 'अभी भुगतान करें', mr: 'आता पेमेंट करा' },
  'khata.payDetail': { en: 'Pay {amount} by UPI', hi: 'UPI से {amount} भेजें', mr: 'UPI ने {amount} पाठवा' },
  'khata.menuBills': { en: 'My bills', hi: 'मेरे बिल', mr: 'माझी बिले' },
  'khata.billsDetail': {
    en: '{count} bills · {amount} still to pay',
    hi: '{count} बिल · {amount} देना बाकी',
    mr: '{count} बिले · {amount} द्यायचे बाकी',
  },
  'khata.billsDetailOne': { en: '1 bill · {amount} still to pay', hi: '1 बिल · {amount} देना बाकी', mr: '1 बिल · {amount} द्यायचे बाकी' },
  'khata.billsDetailOnePaid': { en: '1 bill · paid', hi: '1 बिल · चुकता', mr: '1 बिल · चुकते' },
  'khata.billsDetailPaid': { en: '{count} bills · all paid', hi: '{count} बिल · सब चुकता', mr: '{count} बिले · सर्व चुकते' },
  'khata.billLeft': { en: '{amount} left', hi: '{amount} बाकी', mr: '{amount} बाकी' },
  'khata.billsUnpaid': { en: 'Still to pay ({count})', hi: 'देना बाकी ({count})', mr: 'द्यायचे बाकी ({count})' },
  'khata.billsPaidGroup': { en: 'Fully paid ({count})', hi: 'पूरे चुकता ({count})', mr: 'पूर्ण चुकते ({count})' },
  'khata.billPaidPart': { en: '{amount} already paid', hi: '{amount} जमा हो चुका', mr: '{amount} जमा झाले' },
  'khata.advanceGoesTo': {
    en: 'Your {amount} advance with the shop goes against these.',
    hi: 'दुकान के पास आपका {amount} जमा इन्हीं में लगेगा।',
    mr: 'दुकानाकडे तुमचे {amount} जमा याच बिलांत वापरले जाईल.',
  },
  'khata.noBills': { en: 'No bills yet.', hi: 'अभी कोई बिल नहीं।', mr: 'अजून कोणतेही बिल नाही.' },
  'khata.menuPayments': { en: 'My payments', hi: 'मेरे भुगतान', mr: 'माझी पेमेंट' },
  'khata.paymentsDetail': {
    en: '{count} payments · last on {date}',
    hi: '{count} भुगतान · आख़िरी {date}',
    mr: '{count} पेमेंट · शेवटचे {date}',
  },
  'khata.paymentsDetailOne': { en: '1 payment · {date}', hi: '1 भुगतान · {date}', mr: '1 पेमेंट · {date}' },
  'khata.noPayments': { en: 'No payments yet.', hi: 'अभी कोई भुगतान नहीं।', mr: 'अजून कोणतेही पेमेंट नाही.' },
  'khata.menuEstimates': { en: 'My estimates', hi: 'मेरे एस्टिमेट', mr: 'माझे एस्टिमेट' },
  'khata.estimatesDetail': { en: '{count} estimates', hi: '{count} एस्टिमेट', mr: '{count} एस्टिमेट' },
  'khata.estimatesDetailOne': { en: '1 estimate', hi: '1 एस्टिमेट', mr: '1 एस्टिमेट' },
  'khata.menuOrders': { en: 'My orders', hi: 'मेरे ऑर्डर', mr: 'माझ्या ऑर्डर' },
  'khata.ordersDetail': { en: '{count} orders', hi: '{count} ऑर्डर', mr: '{count} ऑर्डर' },
  'khata.ordersDetailOne': { en: '1 order', hi: '1 ऑर्डर', mr: '1 ऑर्डर' },
  'khata.ordersDetailWaiting': {
    en: '{count} orders · {waiting} waiting for the shop',
    hi: '{count} ऑर्डर · {waiting} दुकान के जवाब का इंतज़ार',
    mr: '{count} ऑर्डर · {waiting} दुकानाच्या उत्तराची वाट',
  },
  'khata.menuStatement': { en: 'Full statement', hi: 'पूरा खाता', mr: 'पूर्ण खाते' },
  'khata.statementDetail': {
    en: 'Every bill and payment, and the PDF',
    hi: 'हर बिल और भुगतान, और PDF',
    mr: 'प्रत्येक बिल आणि पेमेंट, आणि PDF',
  },
  'khata.menuCall': { en: 'Call the shop', hi: 'दुकान को कॉल करें', mr: 'दुकानाला कॉल करा' },
  'khata.orderDetail': {
    en: 'Send a new order to {business}',
    hi: '{business} को नया ऑर्डर भेजें',
    mr: '{business} ला नवीन ऑर्डर पाठवा',
  },
  // The order page's Get directions (migration 031).
  'order.directions': { en: 'Get directions', hi: 'रास्ता देखें', mr: 'रस्ता पाहा' },
  // The order status link's progress timeline (migration 031).
  'tl.title': { en: 'Progress', hi: 'प्रगति', mr: 'प्रगती' },
  'tl.sent': { en: 'Order sent', hi: 'ऑर्डर भेजा', mr: 'ऑर्डर पाठवली' },
  'tl.estimate': { en: 'Estimate ready', hi: 'एस्टिमेट तैयार', mr: 'एस्टिमेट तयार' },
  'tl.accepted': { en: 'Estimate accepted', hi: 'एस्टिमेट स्वीकार', mr: 'एस्टिमेट स्वीकारले' },
  'tl.callAsked': { en: 'You asked for a call', hi: 'आपने कॉल के लिए कहा', mr: 'तुम्ही कॉलसाठी सांगितले' },
  'tl.bill': { en: 'Bill made', hi: 'बिल बना', mr: 'बिल झाले' },
  'tl.billDetail': { en: 'Bill {no} · {date}', hi: 'बिल {no} · {date}', mr: 'बिल {no} · {date}' },
  'tl.delivered': { en: 'Delivered', hi: 'डिलीवर हुआ', mr: 'डिलिव्हर झाले' },
  'tl.received': { en: 'Material received', hi: 'माल मिल गया', mr: 'माल मिळाला' },
  // The khata link's bill and estimate PDFs, estimates and orders (migration 031).
  'khata.billPdf': { en: 'Bill PDF', hi: 'बिल PDF', mr: 'बिल PDF' },
  'khata.estimates': { en: 'Estimates', hi: 'एस्टिमेट', mr: 'एस्टिमेट' },
  'khata.estimate': { en: 'Estimate {no}', hi: 'एस्टिमेट {no}', mr: 'एस्टिमेट {no}' },
  'khata.estimatePdf': { en: 'Estimate PDF', hi: 'एस्टिमेट PDF', mr: 'एस्टिमेट PDF' },
  'khata.estBilled': { en: 'Billed', hi: 'बिल बन गया', mr: 'बिल झाले' },
  'khata.orders': { en: 'Your orders', hi: 'आपके ऑर्डर', mr: 'तुमच्या ऑर्डर' },
  'khata.orderItems': { en: 'Materials: {count}', hi: 'सामान: {count}', mr: 'साहित्य: {count}' },
  'khata.notFound': {
    en: 'This khata link is not valid, or it has been stopped. Please ask your supplier for a new one.',
    hi: 'यह खाता लिंक सही नहीं है या बंद कर दिया गया है। कृपया अपने सप्लायर से नया लिंक माँगें।',
    mr: 'ही खाते लिंक योग्य नाही किंवा बंद केली आहे. कृपया तुमच्या सप्लायरकडून नवीन लिंक मागा.',
  },
  'khata.readOnly': {
    en: 'This page only shows your account. For any question, contact {business}.',
    hi: 'यह पेज सिर्फ़ आपका खाता दिखाता है। किसी भी सवाल के लिए {business} से संपर्क करें।',
    mr: 'हे पेज फक्त तुमचे खाते दाखवते. कोणत्याही प्रश्नासाठी {business} यांच्याशी संपर्क साधा.',
  },
  // UPI (migration 029): Settings…
  'upi.settingsTitle': { en: 'UPI payments', hi: 'UPI भुगतान', mr: 'UPI पेमेंट' },
  'upi.settingsHint': {
    en: 'Optional. A customer sees a UPI option only where you choose — bills, orders and estimates stay as they are.',
    hi: 'वैकल्पिक। ग्राहक को UPI का विकल्प सिर्फ़ वहीं दिखेगा जहाँ आप चाहें — बिल, ऑर्डर और एस्टिमेट जैसे हैं वैसे ही रहेंगे।',
    mr: 'ऐच्छिक. ग्राहकाला UPI पर्याय फक्त तुम्ही ठरवाल तिथेच दिसेल — बिले, ऑर्डर आणि एस्टिमेट आहेत तसेच राहतील.',
  },
  'upi.id': { en: 'Your UPI ID', hi: 'आपकी UPI ID', mr: 'तुमचा UPI ID' },
  'upi.idHint': {
    en: 'For example name@okaxis. Money goes straight to this account.',
    hi: 'जैसे name@okaxis। पैसा सीधे इसी खाते में आएगा।',
    mr: 'उदा. name@okaxis. पैसे थेट याच खात्यात येतील.',
  },
  'upi.idInvalid': {
    en: 'That doesn’t look like a UPI ID. It should look like name@bank.',
    hi: 'यह UPI ID जैसा नहीं लगता। यह name@bank जैसा होना चाहिए।',
    mr: 'हा UPI ID सारखा वाटत नाही. तो name@bank सारखा असावा.',
  },
  'upi.khataSwitch': { en: 'Show “Pay by UPI” on khata links', hi: 'खाता लिंक पर “UPI से भुगतान” दिखाएँ', mr: 'खाते लिंकवर “UPI ने पेमेंट” दाखवा' },
  'upi.khataSwitchHint': {
    en: 'Off unless you turn it on. Customers then see a UPI QR for their balance due on their khata link.',
    hi: 'जब तक आप चालू न करें, बंद रहेगा। चालू करने पर ग्राहकों को खाता लिंक पर बकाया रकम का UPI QR दिखेगा।',
    mr: 'तुम्ही सुरू करेपर्यंत बंद राहील. सुरू केल्यावर ग्राहकांना खाते लिंकवर बाकी रकमेचा UPI QR दिसेल.',
  },
  'upi.needId': { en: 'Add your UPI ID first.', hi: 'पहले अपनी UPI ID डालें।', mr: 'आधी तुमचा UPI ID टाका.' },
  // …the customer page's Show UPI QR…
  'upi.showQr': { en: 'Show UPI QR', hi: 'UPI QR दिखाएँ', mr: 'UPI QR दाखवा' },
  'upi.qrTitle': { en: 'UPI QR for {name}', hi: '{name} के लिए UPI QR', mr: '{name} साठी UPI QR' },
  'upi.amount': { en: 'Amount (₹)', hi: 'रकम (₹)', mr: 'रक्कम (₹)' },
  'upi.generate': { en: 'Show QR', hi: 'QR दिखाएँ', mr: 'QR दाखवा' },
  'upi.change': { en: 'Change amount', hi: 'रकम बदलें', mr: 'रक्कम बदला' },
  'upi.scanHint': {
    en: 'Ask the customer to scan this with any UPI app. The amount is filled in for them.',
    hi: 'ग्राहक से इसे किसी भी UPI ऐप से स्कैन करने को कहें। रकम अपने-आप भरी होगी।',
    mr: 'ग्राहकाला हे कोणत्याही UPI ॲपने स्कॅन करायला सांगा. रक्कम आपोआप भरलेली असेल.',
  },
  'upi.limitNote': {
    en: 'Many banks allow up to ₹1,00,000 in one UPI payment — a larger amount may be refused by the customer’s app.',
    hi: 'कई बैंक एक UPI भुगतान में ₹1,00,000 तक ही देते हैं — इससे बड़ी रकम ग्राहक का ऐप मना कर सकता है।',
    mr: 'अनेक बँका एका UPI पेमेंटमध्ये ₹1,00,000 पर्यंतच परवानगी देतात — यापेक्षा मोठी रक्कम ग्राहकाचे ॲप नाकारू शकते.',
  },
  'upi.sendQr': { en: 'Send QR on WhatsApp', hi: 'QR WhatsApp पर भेजें', mr: 'QR WhatsApp वर पाठवा' },
  'upi.qrMessage': {
    en: 'Hi {name}, please scan this QR with any UPI app to pay {amount} to {business}.',
    hi: 'नमस्ते {name}, {business} को {amount} देने के लिए यह QR किसी भी UPI ऐप से स्कैन करें।',
    mr: 'नमस्कार {name}, {business} यांना {amount} देण्यासाठी हा QR कोणत्याही UPI ॲपने स्कॅन करा.',
  },
  'upi.recordHint': {
    en: 'Tap it once the money shows in your account — nothing is recorded by itself.',
    hi: 'पैसा खाते में दिखने पर ही दबाएँ — अपने-आप कुछ दर्ज नहीं होता।',
    mr: 'पैसे खात्यात दिसल्यावरच दाबा — आपोआप काहीही नोंदवले जात नाही.',
  },
  'upi.recordNow': { en: 'Money received? Record it', hi: 'पैसा मिल गया? दर्ज करें', mr: 'पैसे मिळाले? नोंदवा' },
  'upi.noId': {
    en: 'Add your UPI ID in Settings to show a QR.',
    hi: 'QR दिखाने के लिए Settings में अपनी UPI ID डालें।',
    mr: 'QR दाखवण्यासाठी Settings मध्ये तुमचा UPI ID टाका.',
  },
  'upi.goSettings': { en: 'Open Settings', hi: 'Settings खोलें', mr: 'Settings उघडा' },
  'upi.imageCaption': { en: 'Scan with any UPI app', hi: 'किसी भी UPI ऐप से स्कैन करें', mr: 'कोणत्याही UPI ॲपने स्कॅन करा' },
  // …and the customer's khata page.
  'upi.payTitle': { en: 'Pay by UPI', hi: 'UPI से भुगतान', mr: 'UPI ने पेमेंट' },
  'upi.payHint': {
    en: 'Scan with any UPI app, or tap the button on this phone. It shows here once {business} has recorded it.',
    hi: 'किसी भी UPI ऐप से स्कैन करें, या इसी फ़ोन पर बटन दबाएँ। {business} के दर्ज करने के बाद यह यहाँ दिखेगा।',
    mr: 'कोणत्याही UPI ॲपने स्कॅन करा, किंवा याच फोनवर बटण दाबा. {business} यांनी नोंदवल्यावर हे इथे दिसेल.',
  },
  'upi.openApp': { en: 'Pay {amount} in UPI app', hi: 'UPI ऐप में {amount} दें', mr: 'UPI ॲपमध्ये {amount} द्या' },
  'ord.cancel': { en: 'Cancel', hi: 'रद्द करें', mr: 'रद्द करा' },
  'ord.whatsappMessage': {
    en: 'Hi {name}, about your order request with {business}: ',
    hi: 'नमस्ते {name}, {business} को भेजे आपके ऑर्डर के बारे में: ',
    mr: 'नमस्कार {name}, {business} कडे पाठवलेल्या तुमच्या ऑर्डरबद्दल: ',
  },
  'ord.fromOrder': { en: 'From online order — {name} · {phone}', hi: 'ऑनलाइन ऑर्डर से — {name} · {phone}', mr: 'ऑनलाइन ऑर्डरमधून — {name} · {phone}' },
  'ord.addAsNew': {
    en: '{name} will be added as a new customer when you save.',
    hi: 'सेव करने पर {name} नए ग्राहक के रूप में जुड़ेंगे।',
    mr: 'सेव्ह केल्यावर {name} नवीन ग्राहक म्हणून जोडले जातील.',
  },
  'ord.orPickExisting': {
    en: 'Or pick an existing customer below.',
    hi: 'या नीचे से कोई पुराना ग्राहक चुनें।',
    mr: 'किंवा खालून जुना ग्राहक निवडा.',
  },
  'ord.settingsTitle': { en: 'Online orders', hi: 'ऑनलाइन ऑर्डर', mr: 'ऑनलाइन ऑर्डर' },
  'ord.settingsHint': {
    en: 'Let customers send you orders from a link. You check and approve every order; nothing is billed automatically.',
    hi: 'ग्राहक एक लिंक से आपको ऑर्डर भेज सकें। हर ऑर्डर आप देखकर स्वीकार करते हैं; कुछ भी अपने-आप बिल नहीं होता।',
    mr: 'ग्राहक एका लिंकवरून तुम्हाला ऑर्डर पाठवू शकतात. प्रत्येक ऑर्डर तुम्ही तपासून स्वीकारता; काहीही आपोआप बिल होत नाही.',
  },
  'ord.enable': { en: 'Take orders online', hi: 'ऑनलाइन ऑर्डर लें', mr: 'ऑनलाइन ऑर्डर घ्या' },
  'ord.showPrices': { en: 'Show prices to customers', hi: 'ग्राहकों को दाम दिखाएँ', mr: 'ग्राहकांना दर दाखवा' },
  'ord.showPricesHint': {
    en: 'They see your current rates, marked as indicative.',
    hi: 'उन्हें आपके मौजूदा दाम अंदाज़न बताकर दिखेंगे।',
    mr: 'त्यांना तुमचे सध्याचे दर अंदाजे म्हणून दिसतील.',
  },
  'ord.link': { en: 'Your order link', hi: 'आपका ऑर्डर लिंक', mr: 'तुमची ऑर्डर लिंक' },
  'ord.linkHint': { en: 'Small letters, numbers and dashes.', hi: 'छोटे अक्षर, अंक और डैश।', mr: 'लहान अक्षरे, अंक आणि डॅश.' },
  'ord.linkTaken': {
    en: 'That link is already taken. Try another.',
    hi: 'यह लिंक पहले से लिया हुआ है। दूसरा आज़माएँ।',
    mr: 'ही लिंक आधीच घेतली आहे. दुसरी वापरून पहा.',
  },
  'ord.linkInvalid': {
    en: 'Use 3–40 small letters, numbers or dashes.',
    hi: '3–40 छोटे अक्षर, अंक या डैश रखें।',
    mr: '3–40 लहान अक्षरे, अंक किंवा डॅश वापरा.',
  },
  'ord.share': { en: 'Share on WhatsApp', hi: 'WhatsApp पर भेजें', mr: 'WhatsApp वर पाठवा' },
  'ord.openPage': { en: 'Open page', hi: 'पेज खोलें', mr: 'पेज उघडा' },
  'ord.shareMessage': {
    en: 'Order building materials from {business} here: {url}',
    hi: '{business} से सामान यहाँ ऑर्डर करें: {url}',
    mr: '{business} कडून साहित्य येथे ऑर्डर करा: {url}',
  },
  'dash.newOrdersOne': { en: '1 new order waiting', hi: '1 नया ऑर्डर आया है', mr: '1 नवीन ऑर्डर आली आहे' },
  'dash.newOrdersMany': { en: '{count} new orders waiting', hi: '{count} नए ऑर्डर आए हैं', mr: '{count} नवीन ऑर्डर आल्या आहेत' },
  'dash.reviewOrders': { en: 'Review →', hi: 'देखें →', mr: 'पहा →' },
  // The Dashboard's once-a-day rates card.
  'rates.title': { en: 'Update today’s rates?', hi: 'आज के रेट अपडेट करें?', mr: 'आजचे दर अपडेट करायचे?' },
  'rates.hint': {
    en: 'Rates not checked yet today. Bills and estimates start from them.',
    hi: 'आज रेट अभी जाँचे नहीं गए। बिल और अनुमान इन्हीं से बनते हैं।',
    mr: 'आज दर अजून तपासले नाहीत. बिल आणि अंदाज यांवरूनच होतात.',
  },
  'rates.update': { en: 'Update rates', hi: 'रेट अपडेट करें', mr: 'दर अपडेट करा' },
  'rates.same': { en: 'Same as yesterday', hi: 'कल जैसे ही', mr: 'कालसारखेच' },
  // The Update rates popup on the Dashboard.
  'rates.popupTitle': { en: 'Today’s rates', hi: 'आज के रेट', mr: 'आजचे दर' },
  'rates.popupHint': {
    en: 'Change only the rates that moved today — the rest stay as they are.',
    hi: 'सिर्फ़ वही रेट बदलें जो आज बदले — बाकी वैसे ही रहेंगे।',
    mr: 'आज बदललेले दरच बदला — बाकी तसेच राहतील.',
  },
  'rates.was': { en: 'was {amount}', hi: 'पहले {amount}', mr: 'आधी {amount}' },
  'rates.rateOf': { en: 'Rate of {name}', hi: '{name} का रेट', mr: '{name} चा दर' },
  'rates.save': { en: 'Save rates ({count})', hi: 'रेट सेव करें ({count})', mr: 'दर सेव्ह करा ({count})' },
  'rates.saveNone': { en: 'Change a rate to save', hi: 'सेव करने के लिए कोई रेट बदलें', mr: 'सेव्ह करण्यासाठी एखादा दर बदला' },
  'rates.saved': { en: '{count} rates updated', hi: '{count} रेट अपडेट हुए', mr: '{count} दर अपडेट झाले' },
  // The welcome card's logo (a hover hint on a computer).
  'dash.logoHint': {
    en: 'Tap for your profile. Hold to show your order QR.',
    hi: 'प्रोफ़ाइल के लिए टैप करें। ऑर्डर QR के लिए दबाकर रखें।',
    mr: 'प्रोफाइलसाठी टॅप करा. ऑर्डर QR साठी दाबून धरा.',
  },
} satisfies Record<string, Entry>

export type TranslationKey = keyof typeof STRINGS

/**
 * Looks up `key` in `lang`, filling `{placeholders}` from `vars`.
 * Falls back to English if a translation is somehow missing, so a gap in the
 * dictionary shows readable English rather than a raw key.
 */
export function translate(lang: Lang, key: TranslationKey, vars?: Record<string, string | number>): string {
  const entry = STRINGS[key] as Entry | undefined
  let text = entry?.[lang] || entry?.en || key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}
