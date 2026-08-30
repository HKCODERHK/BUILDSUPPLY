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
  'nav.materials': { en: 'Materials', hi: 'माल', mr: 'माल' },
  'nav.invoices': { en: 'Invoices', hi: 'बिल', mr: 'बिल' },
  'nav.quotations': { en: 'Quotations', hi: 'कोटेशन', mr: 'कोटेशन' },
  'nav.payments': { en: 'Payments', hi: 'पेमेंट', mr: 'पेमेंट' },
  'nav.deliveries': { en: 'Deliveries', hi: 'डिलीवरी', mr: 'डिलिव्हरी' },
  'nav.reminders': { en: 'Reminders', hi: 'रिमाइंडर', mr: 'रिमाइंडर' },
  'nav.reports': { en: 'Reports', hi: 'रिपोर्ट', mr: 'रिपोर्ट' },
  'nav.settings': { en: 'Settings', hi: 'सेटिंग', mr: 'सेटिंग' },
  'nav.more': { en: 'More', hi: 'और', mr: 'आणखी' },
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

  // ── Dashboard ─────────────────────────────────────────────────────────
  'dash.welcome': { en: 'Welcome back, {name}', hi: 'नमस्ते, {name}', mr: 'नमस्कार, {name}' },
  'dash.subtitle': {
    en: "Here's how your business is doing.",
    hi: 'आपका कारोबार कैसा चल रहा है।',
    mr: 'तुमचा व्यवसाय कसा चालू आहे.',
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
  'inv.deliveryAsk': {
    en: '{no} is saved. Have you delivered the material to the customer?',
    hi: '{no} सेव हो गया। क्या माल ग्राहक को दे दिया?',
    mr: '{no} सेव झाले. माल ग्राहकाला दिला का?',
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
  'pay.none': { en: 'No payments recorded yet.', hi: 'अभी कोई पेमेंट दर्ज नहीं।', mr: 'अजून पेमेंट नोंदवले नाही.' },
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
  'pay.pendingNow': {
    en: 'Pending right now: {amount}. Whatever you enter is applied to their oldest unpaid bills first.',
    hi: 'अभी बाकी: {amount}। जो रकम डालेंगे वह सबसे पुराने बिलों में पहले लगेगी।',
    mr: 'आत्ता बाकी: {amount}. जी रक्कम टाकाल ती सर्वात जुन्या बिलांना आधी लागेल.',
  },
  'pay.leftOver': {
    en: "{amount} was more than this customer owed, so it wasn't recorded. Their khata is now fully settled.",
    hi: '{amount} ग्राहक की बाकी से ज़्यादा था, इसलिए दर्ज नहीं हुआ। उनका खाता अब पूरा चुक्ता है।',
    mr: '{amount} ग्राहकाच्या बाकीपेक्षा जास्त होते, म्हणून नोंदवले नाही. त्यांचे खाते आता पूर्ण फिटले आहे.',
  },

  // ── Reminders ─────────────────────────────────────────────────────────
  'rem.title': { en: 'Pending Reminders', hi: 'बाकी वाले ग्राहक', mr: 'बाकी असलेले ग्राहक' },
  'rem.subtitle': {
    en: 'Sends the customer their full statement PDF — nothing goes out automatically',
    hi: 'ग्राहक को उनका पूरा हिसाब पीडीएफ में भेजता है — अपने आप कुछ नहीं जाता',
    mr: 'ग्राहकाला त्यांचा पूर्ण हिशोब पीडीएफमध्ये पाठवते — आपोआप काहीही जात नाही',
  },
  'rem.none': {
    en: "No pending balances — everyone's paid up.",
    hi: 'किसी की उधारी बाकी नहीं — सब चुक्ता है।',
    mr: 'कोणाचीही उधारी बाकी नाही — सर्व फिटले आहे.',
  },
  'rem.remind': { en: 'Remind', hi: 'याद दिलाएँ', mr: 'आठवण करा' },
  'rem.noPhone': { en: 'No phone on file', hi: 'फ़ोन नंबर नहीं है', mr: 'फोन नंबर नाही' },

  // ── Settings ──────────────────────────────────────────────────────────
  'set.language': { en: 'Language', hi: 'भाषा', mr: 'भाषा' },
  'set.languageHint': {
    en: 'Changes the app for you only. Bills and PDFs stay in English so any customer can read them.',
    hi: 'सिर्फ़ आपके लिए बदलेगा। बिल और पीडीएफ अंग्रेज़ी में ही रहेंगे ताकि हर ग्राहक पढ़ सके।',
    mr: 'फक्त तुमच्यासाठी बदलेल. बिल आणि पीडीएफ इंग्रजीतच राहतील जेणेकरून प्रत्येक ग्राहक वाचू शकेल.',
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
