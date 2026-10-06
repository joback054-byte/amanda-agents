/* ============================================================
   Amanda Agent — shared.js v5.0 (CLEAN, NO MAINTENANCE)
   ============================================================ */

/* ---------- FIREBASE ---------- */
var firebaseConfig = {
  apiKey: "AIzaSyCd2GFBzub-aq3wwREbCw_f63CKc2DBvtU",
  authDomain: "amanda-agent-37545.firebaseapp.com",
  projectId: "amanda-agent-37545",
  storageBucket: "amanda-agent-37545.firebasestorage.app",
  messagingSenderId: "305196521869",
  appId: "1:305196521869:web:87a0bfd29de2caa23ec5c4",
  measurementId: "G-98NT7EELSM"
};

var fbDB = null;
var fbReady = false;
var fbListeners = [];

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('[Firebase] SDK not loaded');
    return false;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    fbDB = firebase.firestore();
    fbReady = true;
    console.log('[Firebase] ✅ Initialized');
    return true;
  } catch (e) {
    console.error('[Firebase] ❌', e);
    return false;
  }
}

/* ---------- FIRESTORE SYNC ---------- */
async function fbSaveUser(u) {
  if (!fbReady || !u || !u.id) return;
  try { await fbDB.collection('users').doc(u.id).set(u, { merge: true }); } catch (e) {}
}
async function fbSaveProfile(p) {
  if (!fbReady || !p || !p.id) return;
  try { await fbDB.collection('profiles').doc(p.id).set(p, { merge: true }); } catch (e) {}
}
async function fbSaveMessage(m) {
  if (!fbReady || !m || !m.id) return;
  try { await fbDB.collection('messages').doc(m.id).set(m, { merge: true }); } catch (e) {}
}
async function fbSaveUpdate(u) {
  if (!fbReady || !u || !u.id) return;
  try { await fbDB.collection('updates').doc(u.id).set(u, { merge: true }); } catch (e) {}
}
async function fbSaveSettings(s) {
  if (!fbReady) return;
  try { await fbDB.collection('settings').doc('main').set(s || {}, { merge: true }); } catch (e) {}
}

async function fbLoadAll() {
  if (!fbReady) return null;
  try {
    var result = { users: [], profiles: [], messages: [], updates: [], settings: {} };
    var usersSnap = await fbDB.collection('users').get();
    usersSnap.forEach(function(doc) { result.users.push(doc.data()); });
    var profsSnap = await fbDB.collection('profiles').get();
    profsSnap.forEach(function(doc) { result.profiles.push(doc.data()); });
    var msgsSnap = await fbDB.collection('messages').get();
    msgsSnap.forEach(function(doc) { result.messages.push(doc.data()); });
    var updSnap = await fbDB.collection('updates').get();
    updSnap.forEach(function(doc) { result.updates.push(doc.data()); });
    var settSnap = await fbDB.collection('settings').doc('main').get();
    if (settSnap.exists) {
      result.settings = settSnap.data();
      if (result.settings.customTexts) {
        CUSTOM_TEXTS = result.settings.customTexts;
        try { localStorage.setItem('ea_custom_texts', JSON.stringify(CUSTOM_TEXTS)); } catch (e) {}
      }
    }

    var fsTotal = result.users.length + result.profiles.length + result.messages.length + result.updates.length;
    if (fsTotal === 0) {
      var localTotal = 0;
      try {
        localTotal = (JSON.parse(localStorage.getItem('ea_users') || '[]')).length
                   + (JSON.parse(localStorage.getItem('ea_profiles') || '[]')).length;
      } catch (e) {}
      if (localTotal > 0) {
        var localDB = loadDB();
        (localDB.users || []).forEach(function(u) { fbSaveUser(u); });
        (localDB.profiles || []).forEach(function(p) { fbSaveProfile(p); });
      }
      return null;
    }

    try {
      localStorage.setItem('ea_users', JSON.stringify(result.users));
      localStorage.setItem('ea_profiles', JSON.stringify(result.profiles));
      localStorage.setItem('ea_messages', JSON.stringify(result.messages));
      localStorage.setItem('ea_updates', JSON.stringify(result.updates));
      localStorage.setItem('ea_settings', JSON.stringify(result.settings));
    } catch (e) {}

    console.log('[Firebase] ✅ Loaded:', result.users.length, 'users,', result.profiles.length, 'profiles');
    return result;
  } catch (e) {
    console.error('[Firebase] Load error:', e);
    return null;
  }
}

function fbListenMessages(callback) {
  if (!fbReady) return;
  try {
    var unsub = fbDB.collection('messages').orderBy('time', 'desc').limit(100)
      .onSnapshot(function(snapshot) {
        var msgs = [];
        snapshot.forEach(function(doc) { msgs.push(doc.data()); });
        try { localStorage.setItem('ea_messages', JSON.stringify(msgs)); } catch (e) {}
        if (typeof callback === 'function') callback(msgs);
      }, function(err) {});
    fbListeners.push(unsub);
  } catch (e) {}
}

function fbListenUpdates(callback) {
  if (!fbReady) return;
  try {
    var unsub = fbDB.collection('updates')
      .onSnapshot(function(snapshot) {
        var ups = [];
        snapshot.forEach(function(doc) { ups.push(doc.data()); });
        try { localStorage.setItem('ea_updates', JSON.stringify(ups)); } catch (e) {}
        if (typeof callback === 'function') callback(ups);
      }, function(err) {});
    fbListeners.push(unsub);
  } catch (e) {}
}

function fbSetTyping(userId, toId, isTyping) {
  if (!fbReady || !userId || !toId) return;
  try {
    fbDB.collection('typing').doc(userId).set({
      userId: userId, toId: toId, typing: !!isTyping, time: Date.now()
    }, { merge: true });
  } catch (e) {}
}

function fbListenTyping(myId, callback) {
  if (!fbReady) return;
  try {
    var unsub = fbDB.collection('typing').where('toId', '==', myId)
      .onSnapshot(function(snapshot) {
        var typers = [];
        snapshot.forEach(function(doc) {
          var d = doc.data();
          if (d.typing && (Date.now() - d.time) < 5000) typers.push(d.userId);
        });
        if (typeof callback === 'function') callback(typers);
      }, function(err) {});
    fbListeners.push(unsub);
  } catch (e) {}
}

async function fbMarkRead(messageIds) {
  if (!fbReady || !messageIds || !messageIds.length) return;
  try {
    var batch = fbDB.batch();
    for (var i = 0; i < messageIds.length && i < 500; i++) {
      batch.update(fbDB.collection('messages').doc(messageIds[i]), { read: true });
    }
    await batch.commit();
  } catch (e) {}
}

/* ---------- THEME ---------- */
var THEME = 'light';
var ACCENT = 'pink';
var ACCENTS = ['pink', 'purple', 'blue', 'gold', 'green'];
try {
  THEME = localStorage.getItem('ea_theme') || 'light';
  ACCENT = localStorage.getItem('ea_accent') || 'pink';
} catch (e) {}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', THEME);
  document.documentElement.setAttribute('data-accent', ACCENT);
  var b = document.getElementById('themeBtn');
  if (b) b.textContent = THEME === 'dark' ? '☀️' : '🌙';
  if (typeof applyLogo === 'function') applyLogo();
  if (typeof applyCover === 'function') applyCover();
}
function toggleTheme() {
  THEME = THEME === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('ea_theme', THEME); } catch (e) {}
  applyTheme();
}
function cycleAccent() {
  var i = ACCENTS.indexOf(ACCENT);
  ACCENT = ACCENTS[(i + 1) % ACCENTS.length];
  try { localStorage.setItem('ea_accent', ACCENT); } catch (e) {}
  applyTheme();
}

/* ---------- LANG ---------- */
var LANG = 'en';
var LANGS = [
  { code: 'am', flag: '🇪🇹', name: 'አማርኛ' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano' },
  { code: 'es', flag: '🇪🇸', name: 'Español' }
];
try { LANG = localStorage.getItem('ea_lang') || 'en'; } catch (e) {}

/* ---------- CUSTOM TEXTS ---------- */
var CUSTOM_TEXTS = {};
try { CUSTOM_TEXTS = JSON.parse(localStorage.getItem('ea_custom_texts') || '{}'); } catch (e) {}

/* ---------- TRANSLATIONS (compact) ---------- */
var TRANS = {
  am: {
    brand_sub:'Fashion & Beauty',control_panel:'Control Panel',owner_badge:'OWNER',
    nav_home:'Home',nav_profile:'Profile',nav_messages:'Messages',nav_stats:'Stats',nav_dash:'Dash',nav_support:'Support',nav_fav:'Favorites',
    login:'ግባ',register:'ተመዝገብ',logout:'ውጣ',
    tab_login:'🔑 ግባ',tab_register:'✨ ተመዝገብ',tab_apply:'🌟 Model',
    lbl_username:'የተጠቃሚ ስም / ስልክ',lbl_password:'የይለፍ ቃል',lbl_name:'ሙሉ ስም',lbl_username2:'የተጠቃሚ ስም',
    lbl_phone:'ስልክ ቁጥር',lbl_pass:'የይለፍ ቃል',lbl_confirm:'የይለፍ ቃል ያረጋግጡ',
    lbl_age:'ዕድሜ',lbl_bio:'ስለ ራስሽ',lbl_photos2:'ፎቶዎች (2 ግዴታ)',
    btn_login:'🔓 ግባ',btn_login_model:'🌟 Login as Model',btn_register:'✨ ተመዝገብ',btn_apply:'🌟 ማመልከቻ አስገባ',
    btn_back:'← ተመለስ',btn_back2:'← ተመለስ',btn_save:'💾 አስቀምጥ',btn_cancel:'ሰርዝ',btn_cancel2:'ሰርዝ',
    btn_yes:'አዎ',btn_no:'አይ',btn_send:'📤 ላክ',
    auth_login_t:'እንኳን ደህና መጡ',auth_login_d:'በተጠቃሚ ስምዎ ወይም በስልክ ቁጥርዎ ይግቡ',
    auth_reg_t:'አዲስ አካውንት',auth_reg_d:'ሙሉ ስም፣ Username እና ስልክ',
    auth_apply_t:'🌟 Apply for Model',auth_apply_d:'ማመልከቻ ያስገቡ',
    divider_or:'ወይም',demo_owner_hint:'Demo: owner · 123456',
    model_login_hint:'🌟 ተቀባይነት ያገኙ ሞዴሎች ብቻ',apply_hint:'🌟 ኦነሩ ሲቀበልዎ ብቻ',
    photo1:'ፎቶ 1',photo2:'ፎቶ 2',
    hero_badge:'✨ አዲስ ዘመናዊ መድረክ',hero_t1:'ውበትዎን የሚያሳዩ',hero_t2:'ምርጥ ሞዴሎች',
    hero_sub:'Amanda Agent ላይ ለሴቶች የተዘጋጁ ዘመናዊ እቃዎችን እና ሞዴሎችን በቀላሉ ይመልከቱ።',
    hero_start:'አሁን ይጀምሩ',hero_model:'Model ሁን',
    stat_profiles:'ጠቅላላ ፕሮፋይሎች',stat_photos:'ጠቅላላ ፎቶዎች',stat_hours:'የስራ ሰዓት',
    stat_models:'Models',stat_customers:'Customers',stat_pending:'Pending',stat_messages:'መልእክቶች',stat_favs:'Favorites',stat_views:'እይታዎች',stat_photos_owner:'ፎቶዎች',stat_updates:'Updates',
    feat1_t:'የተረጋገጡ ሞዴሎች',feat1_d:'እያንዳንዱ ሞዴል በኦነሩ ተረጋግጦ የተመዘገበ ነው።',
    feat2_t:'ፈጣን ግንኙነት',feat2_d:'በቴሌግራም እና በዋትሳፕ በቀጥታ ይገናኙ።',
    feat3_t:'ሞዴል ይሁኑ',feat3_d:'የሞዴልነት ማመልከቻ ያስገቡ እና ተቀባይነት ያግኙ።',
    contact_us:'ያግኙን',contact_sub:'ማንኛውም ጥያቄ ካለዎት ያግኙን።',address:'አድራሻ',
    footer_contact:'📞 Contact',footer_address:'📍 Address',footer_about:'ℹ️ About',
    footer_about_text:'Amanda Agent — ለሴቶች የተዘጋጁ ዘመናዊ የፋሽን እቃዎች።',
    footer_hours:'ሰኞ - ቅዳሜ · 8:00 - 20:00',footer_rights:'© Amanda Agent - መብቱ በህግ የተጠበቀ ነው።',
    welcome:'እንኳን ደህና መጡ',welcome_sub:'ዘመናዊ ሞዴሎችን ይመልከቱ',view_only:'🔒 View Only',
    st_all:'ሁሉም',st_favorites:'የወደድኳቸው',st_recent:'የተመለከትኳቸው',st_photos3:'ፎቶዎች',
    search_model:'ሞዴል ይፈልጉ...',tab_all:'ሁሉም',tab_favorites:'የወደድኳቸው',tab_recent:'የተመለከትኳቸው',
    btn_view:'👁️ ይመልከቱ',no_models:'ምንም ሞዴል የለም',no_results:'ምንም አልተገኘም',
    no_favorites:'ምንም የወደዱት የለም',no_recent:'ምንም የተመለከቱት የለም',
    about_her:'ስለ እሷ',gallery:'የፎቶ ማህደር',info:'መረጃ',ratings:'⭐ ደረጃዎች',
    verified:'✓ የተረጋገጠ',favorite:'🤍 አስቀምጥ',favorited:'❤️ ተቀምጧል',
    fast_text:'💬 Fast Text',contact_now:'አሁን ያግኙ',
    support_title:'🎧 Support',support_sub:'የኦነሩን አገልግሎት ይጠቀሙ',
    support_chat_t:'ከኦነር ጋር ቀጥታ ይወያዩ',support_chat_d:'መልእክት ይላኩ',
    support_msg:'ጥያቄ ወይም አስተያየት',support_send:'📤 ላክ',
    support_tab_ft:'💬 Fast Text',support_tab_sup:'🎧 Support',support_ft_sub:'ከሞዴሎች ጋር',support_sup_sub:'ከኦነር ጋር',
    support_ft_title:'💬 ከሞዴሎች ጋር ውይይት',support_ft_list:'ዝርዝር',
    no_convo:'ምንም ውይይት የለም',no_convo_sub:'ስለ ሞዴል ለመጠየቅ ፕሮፋይል ከፍተው "Fast Text" ይጫኑ',no_msgs:'ምንም መልእክት የለም',
    my_profile:'የእኔ ፕሮፋይል',my_profile_sub:'የግል መረጃዎን ያስተካክሉ',
    edit_profile:'✏️ መረጃ አስተካክል',edit_profile_sub:'ወደ ኦነር ይላካል',
    chat_owner:'💬 ከኦነር ጋር',chat_owner_sub:'ቀጥታ መልእክት',
    my_photos:'የእኔ ፎቶዎች',my_info:'የእኔ መረጃ',
    edit_title:'✏️ ፕሮፋይል አስተካክል',edit_note:'ወደ ኦነር Update File ይሄዳል',
    pending_note_t:'ማሳሰቢያ',pending_note_d:'ለውጦቹ በቀጥታ አይተገበሩም — ኦነሩ ሲያጸድቅ ብቻ ይታያሉ።',
    lbl_full_name:'ሙሉ ስም *',lbl_age2:'ዕድሜ',lbl_phone_ro:'ስልክ (ማስተካከል አይቻልም)',lbl_username_ro:'Username (ማስተካከል አይቻልም)',
    lbl_telegram:'የቴሌግራም ቁጥር',lbl_whatsapp:'የዋትሳፕ ቁጥር',lbl_bio2:'ዝርዝር መረጃ',lbl_photos4:'ፎቶዎች (ማከል ብቻ)',
    btn_send_owner:'📤 ወደ ኦነር ላክ',avatar_hint:'ፎቶ ለመለወጥ ይንኩ',
    owner_home_t:'🏠 ሞዴሎች',owner_home_d:'ሁሉንም ሞዴሎች ያስተዳድሩ',
    owner_add:'＋ አዲስ ሞዴል',owner_add_t:'＋ አዲስ ሞዴል',owner_edit_t:'✏️ አስተካክል',owner_add_d:'የሞዴሉን መረጃ እና ፎቶዎች ያስገቡ',
    owner_profile_t:'👤 ፕሮፋይሎች',owner_profile_d:'ሞዴሎች፣ ደንበኞች፣ Pending እና Updates',
    sub_models:'👥 Models',sub_customers:'👤 Customers',sub_pending:'⏳ Pending',sub_updates:'📝 Updates',
    owner_msgs_t:'💬 መልእክቶች',owner_msgs_d:'ከደንበኞች እና ከሞዴሎች',
    msg_all:'ሁሉም',msg_ft:'💬 Fast Text',msg_sup:'🎧 Support',
    owner_stats_t:'📊 ስታቲስቲክስ',owner_stats_d:'የዌብሳይቱ አጠቃላይ መረጃ',
    owner_dash_t:'⚙️ ዳሽቦርድ',owner_dash_d:'የዌብሳይቱን ቅንብሮች ያስተካክሉ',
    site_info:'🏢 የዌብሳይት መረጃ',site_name_l:'የዌብሳይት ስም',site_tagline_l:'ንዑስ ርዕስ',
    site_logo_l:'🎨 ሎጎ',site_cover_l:'🖼️ Cover Photo',site_upload:'📷 ፎቶ ጫን',site_url:'🔗 URL',site_remove:'🗑️ አጥፋ',
    site_contact_t:'📞 Contact Center',site_tg:'ቴሌግራም',site_wa:'ዋትሳፕ',site_email:'ኢሜይል',site_phone:'ስልክ',site_address:'አድራሻ',site_hours:'የስራ ሰዓት',
    site_footer_t:'📝 የፉተር ጽሑፍ',site_about:'About ጽሑፍ',
    btn_save_set:'💾 አስቀምጥ',btn_reset_set:'↺ ወደ ነባሪ',
    confirm_t:'እርግጠኛ ነዎት?',confirm_del:'ማጥፋት ይፈልጋሉ?',
    chat_placeholder:'መልእክት ይጻፉ...',ask_model:'ስለ ሞዴሉ ይጠይቁ...',
    notif_t:'🔔 ማሳወቂያዎች',notif_read:'ሁሉንም አንብብ',notif_empty:'ምንም ማሳወቂያ የለም',
    me_title:'የእኔ ፕሮፋይል',me_sub:'የግል መረጃዎን ያስተካክሉ',
    sec_security:'🔒 Security',sec_change_pwd:'🔑 Change Password',
    pwd_current:'የአሁኑ የይለፍ ቃል',pwd_new:'አዲስ የይለፍ ቃል',pwd_confirm:'ያረጋግጡ',btn_update_pwd:'🔑 Update Password',
    menu_edit:'የእኔን ፕሮፋይል አስተካክል',menu_chat:'ከኦነር ጋር ተወያይ',menu_logout:'ውጣ',
    lbl_msg:'መልእክት',edit:'✏️',del:'🗑️',approve:'✅ ተቀበል',reject:'❌ ውድቅ',code:'ኮድ',
    f_avatar:'የፕሮፋይል ፎቶ',f_name:'የሞዴሉ ስም *',f_age:'ዕድሜ',f_tg:'የቴሌግራም ቁጥር',f_wa:'የዋትሳፕ ቁጥር',f_bio:'ዝርዝር መረጃ',f_photos:'ፎቶዎች',
    no_cust:'ምንም ደንበኛ የለም',no_pend:'ምንም Pending የለም',no_upd:'ምንም Update የለም'
  },
  en: {
    brand_sub:'Fashion & Beauty',control_panel:'Control Panel',owner_badge:'OWNER',
    nav_home:'Home',nav_profile:'Profile',nav_messages:'Messages',nav_stats:'Stats',nav_dash:'Dash',nav_support:'Support',nav_fav:'Favorites',
    login:'Login',register:'Register',logout:'Logout',
    tab_login:'🔑 Login',tab_register:'✨ Register',tab_apply:'🌟 Model',
    lbl_username:'Username / Phone',lbl_password:'Password',lbl_name:'Full Name',lbl_username2:'Username',
    lbl_phone:'Phone',lbl_pass:'Password',lbl_confirm:'Confirm Password',
    lbl_age:'Age',lbl_bio:'Bio',lbl_photos2:'Photos (2 required)',
    btn_login:'🔓 Login',btn_login_model:'🌟 Login as Model',btn_register:'✨ Register',btn_apply:'🌟 Submit',
    btn_back:'← Back',btn_back2:'← Back',btn_save:'💾 Save',btn_cancel:'Cancel',btn_cancel2:'Cancel',
    btn_yes:'Yes',btn_no:'No',btn_send:'📤 Send',
    auth_login_t:'Welcome Back',auth_login_d:'Login with username or phone',
    auth_reg_t:'Create Account',auth_reg_d:'Full name, username and phone',
    auth_apply_t:'🌟 Apply for Model',auth_apply_d:'Submit your application',
    divider_or:'OR',demo_owner_hint:'Demo: owner · 123456',
    model_login_hint:'🌟 Approved models only',apply_hint:'🌟 Only after approval',
    photo1:'Photo 1',photo2:'Photo 2',
    hero_badge:'✨ A brand new fashion stage',hero_t1:'Discover the',hero_t2:'Finest Models',
    hero_sub:'Explore modern products and models made for women on Amanda Agent.',
    hero_start:'Get Started',hero_model:'Become a Model',
    stat_profiles:'Total Profiles',stat_photos:'Total Photos',stat_hours:'Working Hours',
    stat_models:'Models',stat_customers:'Customers',stat_pending:'Pending',stat_messages:'Messages',stat_favs:'Favorites',stat_views:'Views',stat_photos_owner:'Photos',stat_updates:'Updates',
    feat1_t:'Verified Models',feat1_d:'Every profile is verified by the owner.',
    feat2_t:'Instant Contact',feat2_d:'Reach out via Telegram and WhatsApp.',
    feat3_t:'Become a Model',feat3_d:'Submit your application and get approved.',
    contact_us:'Contact Us',contact_sub:'Reach us for any question.',address:'Address',
    footer_contact:'📞 Contact',footer_address:'📍 Address',footer_about:'ℹ️ About',
    footer_about_text:'Amanda Agent — Modern fashion items made for women.',
    footer_hours:'Mon-Sat · 8:00-20:00',footer_rights:'© Amanda Agent',
    welcome:'Welcome',welcome_sub:'Browse modern models',view_only:'🔒 View Only',
    st_all:'All',st_favorites:'Favorites',st_recent:'Recently Viewed',st_photos3:'Photos',
    search_model:'Search a model...',tab_all:'All',tab_favorites:'Favorites',tab_recent:'Recently Viewed',
    btn_view:'👁️ View',no_models:'No models yet',no_results:'No results',
    no_favorites:'No favorites yet',no_recent:'Nothing viewed yet',
    about_her:'About Her',gallery:'Gallery',info:'Info',ratings:'⭐ Ratings',
    verified:'✓ Verified',favorite:'🤍 Save',favorited:'❤️ Saved',
    fast_text:'💬 Fast Text',contact_now:'Contact Now',
    support_title:'🎧 Support',support_sub:'Use owner services',
    support_chat_t:'Chat with Owner',support_chat_d:'Send a message',
    support_msg:'Question or feedback',support_send:'📤 Send',
    support_tab_ft:'💬 Fast Text',support_tab_sup:'🎧 Support',support_ft_sub:'With models',support_sup_sub:'With owner',
    support_ft_title:'💬 Chat with Models',support_ft_list:'List',
    no_convo:'No conversations',no_convo_sub:'Tap "Fast Text" on a profile',no_msgs:'No messages',
    my_profile:'My Profile',my_profile_sub:'Update your info',
    edit_profile:'✏️ Edit Profile',edit_profile_sub:'Sent to owner',
    chat_owner:'💬 Chat with Owner',chat_owner_sub:'Direct message',
    my_photos:'My Photos',my_info:'My Info',
    edit_title:'✏️ Edit Profile',edit_note:'Changes go to owner',
    pending_note_t:'Notice',pending_note_d:'Applied after owner approval.',
    lbl_full_name:'Full Name *',lbl_age2:'Age',lbl_phone_ro:'Phone (read-only)',lbl_username_ro:'Username (read-only)',
    lbl_telegram:'Telegram',lbl_whatsapp:'WhatsApp',lbl_bio2:'Bio',lbl_photos4:'Photos (add only)',
    btn_send_owner:'📤 Send to Owner',avatar_hint:'Tap to change photo',
    owner_home_t:'🏠 Models',owner_home_d:'Manage all models',
    owner_add:'＋ New Model',owner_add_t:'＋ New Model',owner_edit_t:'✏️ Edit',owner_add_d:'Enter model info and photos',
    owner_profile_t:'👤 Profiles',owner_profile_d:'Models, Customers, Pending',
    sub_models:'👥 Models',sub_customers:'👤 Customers',sub_pending:'⏳ Pending',sub_updates:'📝 Updates',
    owner_msgs_t:'💬 Messages',owner_msgs_d:'From customers',
    msg_all:'All',msg_ft:'💬 Fast Text',msg_sup:'🎧 Support',
    owner_stats_t:'📊 Statistics',owner_stats_d:'Site overview',
    owner_dash_t:'⚙️ Dashboard',owner_dash_d:'Configure site',
    site_info:'🏢 Site Info',site_name_l:'Site Name',site_tagline_l:'Tagline',
    site_logo_l:'🎨 Logo',site_cover_l:'🖼️ Cover Photo',site_upload:'📷 Upload',site_url:'🔗 URL',site_remove:'🗑️ Remove',
    site_contact_t:'📞 Contact Center',site_tg:'Telegram',site_wa:'WhatsApp',site_email:'Email',site_phone:'Phone',site_address:'Address',site_hours:'Hours',
    site_footer_t:'📝 Footer Text',site_about:'About',
    btn_save_set:'💾 Save',btn_reset_set:'↺ Reset',
    confirm_t:'Are you sure?',confirm_del:'Delete this?',
    chat_placeholder:'Type a message...',ask_model:'Ask about the model...',
    notif_t:'🔔 Notifications',notif_read:'Mark all read',notif_empty:'No notifications',
    me_title:'My Profile',me_sub:'Update your info',
    sec_security:'🔒 Security',sec_change_pwd:'🔑 Change Password',
    pwd_current:'Current Password',pwd_new:'New Password',pwd_confirm:'Confirm',btn_update_pwd:'🔑 Update Password',
    menu_edit:'Edit My Profile',menu_chat:'Chat with Owner',menu_logout:'Logout',
    lbl_msg:'Message',edit:'✏️',del:'🗑️',approve:'✅ Approve',reject:'❌ Reject',code:'Code',
    f_avatar:'Profile Photo',f_name:'Model Name *',f_age:'Age',f_tg:'Telegram',f_wa:'WhatsApp',f_bio:'Details',f_photos:'Photos',
    no_cust:'No customers yet',no_pend:'No pending',no_upd:'No updates'
  },
  fr: { brand_sub:'Mode & Beauté', nav_home:'Accueil', nav_profile:'Profil', nav_messages:'Messages', nav_stats:'Stats', nav_dash:'Config', nav_support:'Support', nav_fav:'Favoris', login:'Connexion', register:'Inscription', logout:'Déconnexion', hero_badge:'✨ Nouvelle scène', hero_t1:'Découvrez les', hero_t2:'Meilleurs Modèles', hero_start:'Commencer', hero_model:'Devenir Modèle', welcome:'Bienvenue', my_profile:'Mon Profil', chat_owner:'💬 Chat Propriétaire', edit_profile:'✏️ Modifier', owner_home_t:'🏠 Modèles', owner_profile_t:'👤 Profils', owner_msgs_t:'💬 Messages', owner_stats_t:'📊 Stats', owner_dash_t:'⚙️ Config', btn_login:'🔓 Connexion', btn_register:'✨ S\'inscrire', edit:'✏️', del:'🗑️', approve:'✅ Approuver', reject:'❌ Rejeter', code:'Code', site_info:'🏢 Info Site', site_contact_t:'📞 Contact', site_footer_t:'📝 Pied' },
  ar: { brand_sub:'أزياء وجمال', nav_home:'الرئيسية', nav_profile:'الملف', nav_messages:'الرسائل', nav_stats:'إحصائيات', nav_dash:'التحكم', nav_support:'الدعم', nav_fav:'المفضلة', login:'دخول', register:'تسجيل', logout:'خروج', hero_badge:'✨ منصة جديدة', hero_t1:'اكتشفي', hero_t2:'أفضل العارضات', hero_start:'ابدئي', hero_model:'كوني عارضة', welcome:'مرحبًا', my_profile:'ملفي', chat_owner:'💬 دردشة المالك', edit_profile:'✏️ تعديل', owner_home_t:'🏠 العارضات', owner_profile_t:'👤 الملفات', owner_msgs_t:'💬 الرسائل', owner_stats_t:'📊 إحصائيات', owner_dash_t:'⚙️ التحكم', btn_login:'🔓 دخول', btn_register:'✨ تسجيل', edit:'✏️', del:'🗑️', approve:'✅ موافقة', reject:'❌ رفض', code:'كود', site_info:'🏢 معلومات', site_contact_t:'📞 التواصل', site_footer_t:'📝 التذييل' },
  it: { brand_sub:'Moda & Bellezza', nav_home:'Home', nav_profile:'Profilo', nav_messages:'Messaggi', nav_stats:'Stats', nav_dash:'Config', nav_support:'Supporto', nav_fav:'Preferite', login:'Accedi', register:'Registrati', logout:'Esci', hero_badge:'✨ Nuova scena', hero_t1:'Scopri le', hero_t2:'Migliori Modelle', hero_start:'Inizia', hero_model:'Diventa Modella', welcome:'Benvenuta', my_profile:'Mio Profilo', chat_owner:'💬 Chat Proprietario', edit_profile:'✏️ Modifica', owner_home_t:'🏠 Modelle', owner_profile_t:'👤 Profili', owner_msgs_t:'💬 Messaggi', owner_stats_t:'📊 Stats', owner_dash_t:'⚙️ Config', btn_login:'🔓 Accedi', btn_register:'✨ Registrati', edit:'✏️', del:'🗑️', approve:'✅ Approva', reject:'❌ Rifiuta', code:'Codice', site_info:'🏢 Info Sito', site_contact_t:'📞 Contatti', site_footer_t:'📝 Footer' },
  es: { brand_sub:'Moda & Belleza', nav_home:'Inicio', nav_profile:'Perfil', nav_messages:'Mensajes', nav_stats:'Stats', nav_dash:'Config', nav_support:'Soporte', nav_fav:'Favoritas', login:'Entrar', register:'Registrarse', logout:'Salir', hero_badge:'✨ Nueva escena', hero_t1:'Descubre las', hero_t2:'Mejores Modelos', hero_start:'Empezar', hero_model:'Ser Modelo', welcome:'Bienvenida', my_profile:'Mi Perfil', chat_owner:'💬 Chat Propietario', edit_profile:'✏️ Editar', owner_home_t:'🏠 Modelos', owner_profile_t:'👤 Perfiles', owner_msgs_t:'💬 Mensajes', owner_stats_t:'📊 Stats', owner_dash_t:'⚙️ Panel', btn_login:'🔓 Entrar', btn_register:'✨ Registrarse', edit:'✏️', del:'🗑️', approve:'✅ Aprobar', reject:'❌ Rechazar', code:'Código', site_info:'🏢 Info', site_contact_t:'📞 Contacto', site_footer_t:'📝 Pie' }
};

function T(k) {
  if (!k) return '';
  if (CUSTOM_TEXTS[k]) return CUSTOM_TEXTS[k];
  return (TRANS[LANG] && TRANS[LANG][k]) || TRANS.en[k] || k;
}

function setCustomText(key, value) {
  if (value && String(value).trim()) CUSTOM_TEXTS[key] = String(value).trim();
  else delete CUSTOM_TEXTS[key];
  try { localStorage.setItem('ea_custom_texts', JSON.stringify(CUSTOM_TEXTS)); } catch (e) {}
  if (typeof fbSaveSettings === 'function') fbSaveSettings({ customTexts: CUSTOM_TEXTS });
}
function getCustomText(key) { return CUSTOM_TEXTS[key] || ''; }
function resetAllCustomTexts() {
  CUSTOM_TEXTS = {};
  try { localStorage.setItem('ea_custom_texts', '{}'); } catch (e) {}
  if (typeof fbSaveSettings === 'function') fbSaveSettings({ customTexts: {} });
}

/* ---------- LANG FUNCTIONS ---------- */
function renderLangMenu() {
  var el = document.getElementById('langMenu');
  if (!el) return;
  var h = '';
  for (var i = 0; i < LANGS.length; i++) {
    var l = LANGS[i];
    h += '<button class="lang-item ' + (l.code === LANG ? 'on' : '') + '" onclick="setLang(\'' + l.code + '\')"><span>' + l.flag + '</span><span>' + l.name + '</span></button>';
  }
  el.innerHTML = h;
  var fb = document.getElementById('flagBtn');
  if (fb) for (var j = 0; j < LANGS.length; j++) if (LANGS[j].code === LANG) { fb.textContent = LANGS[j].flag; break; }
}
function toggleLangMenu(e) {
  if (e) e.stopPropagation();
  var all = document.querySelectorAll('.lang-wrap,.notif-wrap,.user-menu-wrap');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('open');
  var w = document.getElementById('langWrap');
  if (w) w.classList.toggle('open');
}
function setLang(c) {
  LANG = c;
  try { localStorage.setItem('ea_lang', c); } catch (e) {}
  var w = document.getElementById('langWrap');
  if (w) w.classList.remove('open');
  renderLangMenu();
  applyLang();
  if (typeof toast === 'function') toast('🌐 ' + c.toUpperCase(), 'ok');
}
function applyLang() {
  var els = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < els.length; i++) {
    var k = els[i].getAttribute('data-i18n');
    var v = T(k);
    if (v && v !== k) els[i].textContent = v;
  }
  var phs = document.querySelectorAll('[data-i18n-ph]');
  for (var j = 0; j < phs.length; j++) {
    var k2 = phs[j].getAttribute('data-i18n-ph');
    var v2 = T(k2);
    if (v2 && v2 !== k2) phs[j].placeholder = v2;
  }
  document.documentElement.lang = LANG;
  document.documentElement.dir = (LANG === 'ar') ? 'rtl' : 'ltr';
}

/* ---------- UTILS ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function initials(n) { return (n || 'U').trim().split(/\s+/).slice(0, 2).map(function(w) { return w[0] || ''; }).join('').toUpperCase(); }
function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }
function timeAgo(t) { var d = Date.now() - t; var m = Math.floor(d / 60000); if (m < 1) return 'now'; if (m < 60) return m + 'm'; var h = Math.floor(m / 60); if (h < 24) return h + 'h'; return Math.floor(h / 24) + 'd'; }
function toast(m, type) {
  type = type || '';
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span>' + (type === 'err' ? '⚠️' : '✅') + '</span><span>' + esc(m) + '</span>';
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(function() { el.remove(); }, 320); }, 2400);
}
function readImage(file, max, cb) {
  var fr = new FileReader();
  fr.onload = function() {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      var s = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      try { cb(c.toDataURL('image/jpeg', 0.78)); } catch (e) {}
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

/* ---------- DB ---------- */
function loadDB() {
  var db = { users: [], profiles: [], messages: [], updates: [], blocks: [], settings: {} };
  try { db.users = JSON.parse(localStorage.getItem('ea_users') || '[]'); } catch (e) {}
  try { db.profiles = JSON.parse(localStorage.getItem('ea_profiles') || '[]'); } catch (e) {}
  try { db.messages = JSON.parse(localStorage.getItem('ea_messages') || '[]'); } catch (e) {}
  try { db.updates = JSON.parse(localStorage.getItem('ea_updates') || '[]'); } catch (e) {}
  try { db.settings = JSON.parse(localStorage.getItem('ea_settings') || '{}'); } catch (e) {}
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.profiles)) db.profiles = [];
  if (!Array.isArray(db.messages)) db.messages = [];
  if (!Array.isArray(db.updates)) db.updates = [];
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  return db;
}
function saveDB(db) {
  if (!db) return;
  try { localStorage.setItem('ea_users', JSON.stringify(db.users || [])); } catch (e) {}
  try { localStorage.setItem('ea_profiles', JSON.stringify(db.profiles || [])); } catch (e) {}
  try { localStorage.setItem('ea_messages', JSON.stringify(db.messages || [])); } catch (e) {}
  try { localStorage.setItem('ea_updates', JSON.stringify(db.updates || [])); } catch (e) {}
  try { localStorage.setItem('ea_settings', JSON.stringify(db.settings || {})); } catch (e) {}
  if (fbReady) {
    try {
      (db.users || []).forEach(function(u) { fbSaveUser(u); });
      (db.profiles || []).forEach(function(p) { fbSaveProfile(p); });
      (db.messages || []).slice(-30).forEach(function(m) { fbSaveMessage(m); });
      (db.updates || []).forEach(function(u) { fbSaveUpdate(u); });
      if (db.settings && Object.keys(db.settings).length) fbSaveSettings(db.settings);
    } catch (e) {}
  }
}

/* ---------- USER / SESSION ---------- */
function findUser(q) {
  var db = loadDB();
  q = String(q || '').trim().toLowerCase();
  if (!q) return null;
  for (var i = 0; i < db.users.length; i++) {
    if (db.users[i].username && db.users[i].username.toLowerCase() === q) return db.users[i];
  }
  var qd = onlyDigits(q);
  if (qd.length >= 6) {
    for (var j = 0; j < db.users.length; j++) {
      if (!db.users[j].phone) continue;
      var pd = onlyDigits(db.users[j].phone);
      if (pd === qd) return db.users[j];
      if (qd.length >= 9 && pd.slice(-qd.length) === qd) return db.users[j];
    }
  }
  return null;
}
function saveSession(u) { try { sessionStorage.setItem('ea_current', u.id); } catch (e) {} }
function getCurrentUser() {
  var id = null;
  try { id = sessionStorage.getItem('ea_current'); } catch (e) {}
  if (!id) return null;
  var db = loadDB();
  for (var i = 0; i < db.users.length; i++) {
    if (db.users[i].id === id) return db.users[i];
  }
  return null;
}
function goTo(p) { try { window.location.href = p; } catch (e) { location.replace(p); } }
function logout() {
  try { sessionStorage.removeItem('ea_current'); } catch (e) {}
  try { sessionStorage.clear(); } catch (e) {}
  try { localStorage.removeItem('ea_current_ls'); } catch (e) {}
  try { window.location.href = 'index.html'; } catch (e) {}
}

/* ---------- LOGO / COVER / FRONT ---------- */
function applyLogo() {
  var s = {};
  try { s = JSON.parse(localStorage.getItem('ea_settings') || '{}'); } catch (e) {}
  if (!s.logo) return;
  var l = document.getElementById('navLogo');
  if (l) l.innerHTML = '<img src="' + s.logo + '">';
  var fl = document.getElementById('footerLogo');
  if (fl) fl.innerHTML = '<img src="' + s.logo + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
}
function applyCover() {
  var s = {};
  try { s = JSON.parse(localStorage.getItem('ea_settings') || '{}'); } catch (e) {}
  var h = document.getElementById('heroBanner');
  if (!h) return;
  if (s.cover) { h.style.backgroundImage = 'url(' + s.cover + ')'; h.classList.add('has-cover'); }
}
function applyFrontPhoto() {
  var s = {};
  try { s = JSON.parse(localStorage.getItem('ea_settings') || '{}'); } catch (e) {}
  var sect = document.getElementById('frontPhotoSection');
  var img = document.getElementById('frontPhotoImg');
  if (!sect || !img) return;
  if (s.frontPhoto) { img.src = s.frontPhoto; sect.style.display = ''; }
  else sect.style.display = 'none';
}

/* ---------- COUNTRIES ---------- */
var COUNTRIES = [
  { c: 'ET', f: '🇪🇹', d: '+251' }, { c: 'KE', f: '🇰🇪', d: '+254' },
  { c: 'EG', f: '🇪🇬', d: '+20' }, { c: 'SA', f: '🇸🇦', d: '+966' },
  { c: 'AE', f: '🇦🇪', d: '+971' }, { c: 'US', f: '🇺🇸', d: '+1' },
  { c: 'GB', f: '🇬🇧', d: '+44' }, { c: 'FR', f: '🇫🇷', d: '+33' },
  { c: 'DE', f: '🇩🇪', d: '+49' }, { c: 'IT', f: '🇮🇹', d: '+39' },
  { c: 'ES', f: '🇪🇸', d: '+34' }, { c: 'TR', f: '🇹🇷', d: '+90' },
  { c: 'IN', f: '🇮🇳', d: '+91' }, { c: 'CN', f: '🇨🇳', d: '+86' }
];
function populateCountries(ids) {
  ids = ids || ['regCountry', 'apCountry'];
  for (var k = 0; k < ids.length; k++) {
    var s = document.getElementById(ids[k]);
    if (!s) continue;
    var h = '';
    for (var i = 0; i < COUNTRIES.length; i++) {
      var x = COUNTRIES[i];
      h += '<option value="' + x.d + '">' + x.f + ' ' + x.c + ' ' + x.d + '</option>';
    }
    s.innerHTML = h;
    s.value = '+251';
  }
}
function populateCountrySelect(sel, def) {
  if (!sel) return;
  var h = '';
  for (var i = 0; i < COUNTRIES.length; i++) {
    var x = COUNTRIES[i];
    h += '<option value="' + x.d + '">' + x.f + ' ' + x.c + ' ' + x.d + '</option>';
  }
  sel.innerHTML = h;
  sel.value = def || '+251';
}

/* ---------- MODEL CODE ---------- */
function generateModelCode(existingCodes) {
  existingCodes = existingCodes || [];
  var used = {};
  for (var i = 0; i < existingCodes.length; i++) used[existingCodes[i]] = true;
  var n = 1;
  while (used['M-' + String(n).padStart(3, '0')]) n++;
  return 'M-' + String(n).padStart(3, '0');
}
function ensureModelCodes() {
  var db = loadDB();
  var changed = false;
  var used = [];
  for (var i = 0; i < db.profiles.length; i++) if (db.profiles[i].code) used.push(db.profiles[i].code);
  for (var j = 0; j < db.profiles.length; j++) {
    if (!db.profiles[j].code) {
      var c = generateModelCode(used);
      db.profiles[j].code = c;
      used.push(c);
      changed = true;
    }
  }
  if (changed) saveDB(db);
  return changed;
}

/* ---------- NOTIFICATIONS ---------- */
function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(function(perm) { console.log('[Notif]', perm); });
  }
}
var _audioCtx = null;
function _getAudioCtx() {
  if (_audioCtx) return _audioCtx;
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    _audioCtx = new AudioCtx();
    return _audioCtx;
  } catch (e) { return null; }
}
function unlockAudio() {
  var ctx = _getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(function() {});
}
function playBeep() {
  try {
    var ctx = _getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().then(function() { _actuallyPlayBeep(ctx); });
    else _actuallyPlayBeep(ctx);
  } catch (e) {}
}
function _actuallyPlayBeep(ctx) {
  try {
    var now = ctx.currentTime;
    [880, 1100].forEach(function(freq, idx) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      var start = now + idx * 0.15;
      g.gain.setValueAtTime(0.001, start);
      g.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
      o.start(start);
      o.stop(start + 0.15);
    });
  } catch (e) {}
}
function showSystemNotif(title, body, onClickUrl) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    var n = new Notification(title || 'Amanda Agent', { body: body || '', tag: 'amanda-' + Date.now(), requireInteraction: false, silent: false });
    n.onclick = function() { window.focus(); if (onClickUrl) window.location.href = onClickUrl; n.close(); };
    setTimeout(function() { try { n.close(); } catch (e) {} }, 8000);
  } catch (e) {}
}
var _baseTitle = document.title || 'Amanda Agent';
function updateTitleCount(count) {
  if (count > 0) document.title = '(' + count + ') ' + _baseTitle;
  else document.title = _baseTitle;
}

document.addEventListener('click', function _au() { unlockAudio(); document.removeEventListener('click', _au); });
document.addEventListener('touchstart', function _aut() { unlockAudio(); document.removeEventListener('touchstart', _aut); });

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', function() {
  initFirebase();
  applyTheme();
  renderLangMenu();
  applyLang();
  applyLogo();
  if (typeof applyFrontPhoto === 'function') applyFrontPhoto();
  if (fbReady) {
    fbLoadAll().then(function(data) {
      if (data && typeof window.onFirebaseReady === 'function') window.onFirebaseReady(data);
    });
  }
  try { ensureModelCodes(); } catch (e) {}
});

document.addEventListener('click', function() {
  var all = document.querySelectorAll('.lang-wrap,.notif-wrap,.user-menu-wrap');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('open');
  var ep = document.getElementById('emojiPanel');
  if (ep) ep.classList.remove('show');
});

console.log('[Amanda] shared.js v5.0 CLEAN ✅');

/* ============================================================
   MAINTENANCE MODE — Overlay (safe, no document.write)
   ============================================================ */
function isMaintenanceOn() {
  try {
    var s = JSON.parse(localStorage.getItem('ea_settings') || '{}');
    return s.maintenance === true;
  } catch (e) { return false; }
}

function isOwnerLoggedIn() {
  try {
    var id = sessionStorage.getItem('ea_current');
    if (!id) return false;
    var db = loadDB();
    for (var i = 0; i < db.users.length; i++) {
      if (db.users[i].id === id && db.users[i].role === 'owner') return true;
    }
  } catch (e) {}
  return false;
}

function checkMaintenance() {
  if (!isMaintenanceOn()) { hideMaintenanceOverlay(); return false; }
  if (isOwnerLoggedIn()) { hideMaintenanceOverlay(); return false; }
  showMaintenanceOverlay();
  return true;
}

function showMaintenanceOverlay() {
  if (document.getElementById('maintOverlay')) return;
  if (!document.getElementById('maintStyles')) {
    var st = document.createElement('style');
    st.id = 'maintStyles';
    st.textContent = '@keyframes mSpin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}@keyframes mBounce{0%,80%,100%{transform:scale(.7);opacity:.5}40%{transform:scale(1);opacity:1}}';
    document.head.appendChild(st);
  }
  var ov = document.createElement('div');
  ov.id = 'maintOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(135deg,#2a1020,#46143a);color:#fff;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px';
  ov.innerHTML = '<div style="max-width:480px;width:100%;text-align:center">' +
    '<div style="font-size:80px;margin-bottom:24px;display:inline-block;animation:mSpin 4s linear infinite">⚙️</div>' +
    '<div style="display:inline-block;padding:8px 18px;border-radius:100px;background:rgba(245,158,11,.2);color:#f59e0b;font-size:13px;font-weight:700;margin-bottom:20px;border:1px solid rgba(245,158,11,.4)">🔧 MAINTENANCE MODE</div>' +
    '<h1 style="font-size:28px;font-weight:800;margin-bottom:12px;background:linear-gradient(135deg,#f59e0b,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent">Under Maintenance</h1>' +
    '<p style="font-size:15px;line-height:1.7;color:rgba(255,255,255,.85);margin-bottom:32px">ሳይቱ በአሁኑ ሰዓት እየተስተካከለ ነው።<br>እባክዎ ቆይተው እንደገና ይሞክሩ።<br><br><span style="font-size:13px;opacity:.7">The site is currently under maintenance.<br>Please check back soon.</span></p>' +
    '<button onclick="doMaintenanceLogout()" style="padding:14px 32px;border-radius:14px;font-size:15px;font-weight:700;border:1.5px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:#fff;cursor:pointer">🚪 Logout</button>' +
    '<div style="margin-top:28px;display:flex;justify-content:center;gap:6px">' +
    '<div style="width:10px;height:10px;border-radius:50%;background:rgba(245,158,11,.5);animation:mBounce 1.4s infinite"></div>' +
    '<div style="width:10px;height:10px;border-radius:50%;background:rgba(245,158,11,.5);animation:mBounce 1.4s infinite .2s"></div>' +
    '<div style="width:10px;height:10px;border-radius:50%;background:rgba(245,158,11,.5);animation:mBounce 1.4s infinite .4s"></div>' +
    '</div></div>';
  document.body.appendChild(ov);
}

function hideMaintenanceOverlay() {
  var ov = document.getElementById('maintOverlay');
  if (ov) ov.remove();
}

function doMaintenanceLogout() {
  try { sessionStorage.clear(); } catch (e) {}
  try { localStorage.removeItem('ea_current_ls'); } catch (e) {}
  window.location.href = 'index.html';
}

/* Real-time settings listener */
function fbListenSettings(callback) {
  if (!fbReady) return;
  try {
    var unsub = fbDB.collection('settings').doc('main')
      .onSnapshot(function(doc) {
        if (doc.exists) {
          var s = doc.data();
          try { localStorage.setItem('ea_settings', JSON.stringify(s)); } catch (e) {}
          if (s.customTexts) {
            CUSTOM_TEXTS = s.customTexts;
            try { localStorage.setItem('ea_custom_texts', JSON.stringify(CUSTOM_TEXTS)); } catch (e) {}
          }
          if (typeof callback === 'function') callback(s);
        }
      }, function(err) {});
    fbListeners.push(unsub);
  } catch (e) {}
}

/* ============================================================
   ONLINE STATUS — Presence System
   ============================================================ */
function fbUpdatePresence(userId, status) {
  if (!fbReady || !userId) return;
  try {
    fbDB.collection('presence').doc(userId).set({
      userId: userId,
      status: status || 'online',
      lastSeen: Date.now()
    }, { merge: true });
  } catch (e) {}
}

function fbListenPresence(callback) {
  if (!fbReady) return;
  try {
    var unsub = fbDB.collection('presence')
      .onSnapshot(function(snapshot) {
        var all = {};
        snapshot.forEach(function(doc) {
          var d = doc.data();
          all[d.userId] = d;
        });
        if (typeof callback === 'function') callback(all);
      }, function(err) {});
    fbListeners.push(unsub);
  } catch (e) {}
}

function getPresenceStatus(presence, userId) {
  if (!presence || !presence[userId]) return 'offline';
  var p = presence[userId];
  var diff = Date.now() - (p.lastSeen || 0);
  if (diff < 70000 && p.status === 'online') return 'online';
  if (diff < 3600000) return 'away';
  return 'offline';
}

function getLastSeen(presence, userId) {
  if (!presence || !presence[userId]) return '';
  return timeAgo(presence[userId].lastSeen || 0);
}

/* Auto-presence: track when user is active */
var _presenceTimer = null;
function startPresenceTracking(userId) {
  if (!userId) return;
  fbUpdatePresence(userId, 'online');

  /* Heartbeat every 30 seconds while page is visible */
  function beat() {
    if (document.visibilityState === 'visible') {
      fbUpdatePresence(userId, 'online');
    }
  }
  if (_presenceTimer) clearInterval(_presenceTimer);
  _presenceTimer = setInterval(beat, 30000);

  /* Mark offline on leave */
  function goOffline() {
    if (fbReady && userId) {
      try {
        fbDB.collection('presence').doc(userId).set({
          userId: userId, status: 'offline', lastSeen: Date.now()
        }, { merge: true });
      } catch (e) {}
    }
  }
  window.addEventListener('beforeunload', goOffline);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      /* Mark away but not offline immediately */
      if (fbReady && userId) {
        try {
          fbDB.collection('presence').doc(userId).set({
            userId: userId, status: 'away', lastSeen: Date.now()
          }, { merge: true });
        } catch (e) {}
      }
    } else {
      beat();
    }
  });
}