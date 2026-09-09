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
  'rem.remind': { en: 'Remind', hi: 'याद दिलाएँ', mr: 'आठवण करा' },
  'rem.noPhone': { en: 'No phone on file', hi: 'फ़ोन नंबर नहीं है', mr: 'फोन नंबर नाही' },

  // ── Settings ──────────────────────────────────────────────────────────
  'set.language': { en: 'Language', hi: 'भाषा', mr: 'भाषा' },
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
  'inv.cancelPayment': {
    en: 'The {amount} recorded against it will be removed.',
    hi: 'इस पर दर्ज {amount} हटा दिए जाएँगे।',
    mr: 'यावर नोंदवलेले {amount} काढून टाकले जातील.',
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
  'pay.leftOverBill': {
    en: '{amount} was more than this bill still owed, so it was not recorded.',
    hi: '{amount} इस बिल की बाकी रकम से ज़्यादा था, इसलिए दर्ज नहीं हुआ।',
    mr: '{amount} या बिलाच्या बाकी रकमेपेक्षा जास्त होते, म्हणून नोंदवले नाही.',
  },
  'inv.paidMoreThanBill': {
    en: 'That is more than this bill. Only {amount} will be recorded.',
    hi: 'यह बिल से ज़्यादा है। सिर्फ़ {amount} दर्ज होगा।',
    mr: 'हे बिलापेक्षा जास्त आहे. फक्त {amount} नोंदवले जाईल.',
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
