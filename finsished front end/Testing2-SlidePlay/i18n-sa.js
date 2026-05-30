(function () {
  const STORAGE_KEY = "sp_language";
  const DEFAULT_LANG = "en";

  const SUPPORTED = {
    en: { name: "English", locale: "en-ZA" },
    zu: { name: "isiZulu", locale: "zu-ZA" },
    xh: { name: "isiXhosa", locale: "xh-ZA" },
    af: { name: "Afrikaans", locale: "af-ZA" },
    nso: { name: "Sepedi", locale: "nso-ZA" },
    tn: { name: "Setswana", locale: "tn-ZA" },
    st: { name: "Sesotho", locale: "st-ZA" },
    ts: { name: "Xitsonga", locale: "ts-ZA" },
    ss: { name: "siSwati", locale: "ss-ZA" },
    ve: { name: "Tshivenda", locale: "ve-ZA" },
    nr: { name: "isiNdebele", locale: "nr-ZA" },
    sasl: { name: "SASL", locale: "en-ZA" },
  };

  const DICT = {
    en: {
      "common.language": "Language",
      "common.selectLanguage": "Select language",
      "common.saslNotice": "SASL is visual. Signed video support should be added for full accessibility.",
      "payment.failed": "Payment Failed",
      "payment.success": "Payment Successful",
      "payment.processing": "Processing Payment...",
      "payment.pleaseWait": "Please wait while we verify your payment.",
      "payment.cancelled": "Payment cancelled.",
      "payment.tryAgain": "Try Again",
      "payment.verificationFailed": "Payment verification failed.",
      "payment.notCaptured": "No payment was captured. You can try again anytime.",
    },
    zu: {
      "common.language": "Ulimi",
      "common.selectLanguage": "Khetha ulimi",
      "common.saslNotice": "I-SASL iboniswa ngokubonakalayo. Kufanele kufakwe amavidiyo olimi lwezandla ukuze kube nokufinyeleleka okuphelele.",
      "payment.failed": "Inkokhelo yehlulekile",
      "payment.success": "Inkokhelo iphumelele",
      "payment.processing": "Sicubungula inkokhelo...",
      "payment.pleaseWait": "Sicela ulinde ngenkathi siqinisekisa inkokhelo yakho.",
      "payment.cancelled": "Inkokhelo ikhanseliwe.",
      "payment.tryAgain": "Zama futhi",
      "payment.verificationFailed": "Ukuqinisekiswa kwenkokhelo kwehlulekile.",
      "payment.notCaptured": "Ayikho inkokhelo ebanjiwe. Ungazama futhi noma nini.",
    },
    xh: {
      "common.language": "Ulwimi",
      "common.selectLanguage": "Khetha ulwimi",
      "common.saslNotice": "I-SASL ibonwa ngamehlo. Faka iividiyo zentetho yezandla ukuze kufikeleleke ngokupheleleyo.",
      "payment.failed": "Intlawulo ayiphumelelanga",
      "payment.success": "Intlawulo iphumelele",
      "payment.processing": "Kusenziwa intlawulo...",
      "payment.pleaseWait": "Nceda ulinde ngelixa siqinisekisa intlawulo yakho.",
      "payment.cancelled": "Intlawulo irhoxisiwe.",
      "payment.tryAgain": "Zama kwakhona",
      "payment.verificationFailed": "Ukuqinisekiswa kwentlawulo akuphumelelanga.",
      "payment.notCaptured": "Akukho ntlawulo ibanjiweyo. Ungazama kwakhona nanini.",
    },
    af: {
      "common.language": "Taal",
      "common.selectLanguage": "Kies taal",
      "common.saslNotice": "SASL is visueel. Voeg gebaretaal-video's by vir volle toeganklikheid.",
      "payment.failed": "Betaling het misluk",
      "payment.success": "Betaling suksesvol",
      "payment.processing": "Betaling word verwerk...",
      "payment.pleaseWait": "Wag asseblief terwyl ons jou betaling verifieer.",
      "payment.cancelled": "Betaling gekanselleer.",
      "payment.tryAgain": "Probeer weer",
      "payment.verificationFailed": "Betalingverifikasie het misluk.",
      "payment.notCaptured": "Geen betaling is vasgel\u00ea nie. Probeer gerus weer.",
    },
    nso: {
      "common.language": "Leleme",
      "common.selectLanguage": "Kgetha leleme",
      "common.saslNotice": "SASL ke ya pono. Tsenya dibidio tsa leleme la diatla gore go fihlelelega ka botlalo.",
      "payment.failed": "Tefo e paletswe",
      "payment.success": "Tefo e atlegile",
      "payment.processing": "Go dirwa tefo...",
      "payment.pleaseWait": "Hle leta ge re sa netefatsa tefo ya gago.",
      "payment.cancelled": "Tefo e khansetswe.",
      "payment.tryAgain": "Leka gape",
      "payment.verificationFailed": "Netefatso ya tefo e paletswe.",
      "payment.notCaptured": "Ga go tefo e tsentswego. O ka leka gape neng kapa neng.",
    },
    tn: {
      "common.language": "Puo",
      "common.selectLanguage": "Tlhopha puo",
      "common.saslNotice": "SASL ke ya pono. Tsenya dibidio tsa puo ya diatla gore go nne bonolo go e dirisa.",
      "payment.failed": "Tuelo e paletswe",
      "payment.success": "Tuelo e atlegile",
      "payment.processing": "Go dirwa tuelo...",
      "payment.pleaseWait": "Tswee-tswee leta fa re netefatsa tuelo ya gago.",
      "payment.cancelled": "Tuelo e phimotswe.",
      "payment.tryAgain": "Leka gape",
      "payment.verificationFailed": "Netefatso ya tuelo e paletswe.",
      "payment.notCaptured": "Ga go tuelo e tshwerweng. O ka leka gape nako efe kapa efe.",
    },
    st: {
      "common.language": "Puo",
      "common.selectLanguage": "Kgetha puo",
      "common.saslNotice": "SASL e bonahala ka mahlo. Kenya divideo tsa matshwao bakeng sa phihlello e feletseng.",
      "payment.failed": "Tefo e hlolehile",
      "payment.success": "Tefo e atlehile",
      "payment.processing": "Tefo e ntse e sebetsoa...",
      "payment.pleaseWait": "Ka kopo ema ha re netefatsa tefo ya hao.",
      "payment.cancelled": "Tefo e hlakotswe.",
      "payment.tryAgain": "Leka hape",
      "payment.verificationFailed": "Netefatso ya tefo e hlolehile.",
      "payment.notCaptured": "Ha ho tefo e tshwerweng. O ka leka hape neng kapa neng.",
    },
    ts: {
      "common.language": "Ririmi",
      "common.selectLanguage": "Hlawula ririmi",
      "common.saslNotice": "SASL i ya ku voniwa. Engetelani tivhidiyo ta ririmi ra mavoko leswaku ku va na ku fikelela hinkwako.",
      "payment.failed": "Nhakelo wu tsandzekile",
      "payment.success": "Nhakelo wu humelerile",
      "payment.processing": "Ku lulamisiwa nhakelo...",
      "payment.pleaseWait": "Kombela yimela loko hi ri karhi hi tiyisisa nhakelo wa wena.",
      "payment.cancelled": "Nhakelo wu khanseriwile.",
      "payment.tryAgain": "Ringeta nakambe",
      "payment.verificationFailed": "Ku tiyisisa nhakelo ku tsandzekile.",
      "payment.notCaptured": "A ku na nhakelo lowu khomiweke. U nga ringeta nakambe nkarhi wun'wana na wun'wana.",
    },
    ss: {
      "common.language": "Lulwimi",
      "common.selectLanguage": "Khetsa lulwimi",
      "common.saslNotice": "I-SASL ibonakala ngemehlo. Faka emavidiyo etandla kuze kube nekufinyelela lokuphelele.",
      "payment.failed": "Inkhokhelo yehlulekile",
      "payment.success": "Inkhokhelo iphumelele",
      "payment.processing": "Kucubungulwa inkhokhelo...",
      "payment.pleaseWait": "Uyacelwa ulinde ngenkathi sicinisekisa inkhokhelo yakho.",
      "payment.cancelled": "Inkhokhelo ikhanseliwe.",
      "payment.tryAgain": "Zama futsi",
      "payment.verificationFailed": "Kucinisekiswa kwenkhokhelo kwehlulekile.",
      "payment.notCaptured": "Akukho nkhokhelo ebanjiwe. Ungazama futsi noma nini.",
    },
    ve: {
      "common.language": "Luambo",
      "common.selectLanguage": "Nangani luambo",
      "common.saslNotice": "SASL ndi ya u vhona. Engedzani video dza luambo lwa zwanḓa u itela u swikeleleka ho fhelelaho.",
      "payment.failed": "Mbadelano yo kundelwa",
      "payment.success": "Mbadelano yo bvelela",
      "payment.processing": "Khwinisani mbadelano...",
      "payment.pleaseWait": "Ri humbela ni lindele musi ri tshi khou khwathisa mbadelano yaṋu.",
      "payment.cancelled": "Mbadelano yo khanselwa.",
      "payment.tryAgain": "Lingedzani hafhu",
      "payment.verificationFailed": "U khwaṱhisedzwa ha mbadelano ho kundelwa.",
      "payment.notCaptured": "A huna mbadelano yo farelwaho. Ni nga lingedza hafhu tshifhinga tshiṅwe na tshiṅwe.",
    },
    nr: {
      "common.language": "Ilimi",
      "common.selectLanguage": "Khetha ilimi",
      "common.saslNotice": "I-SASL ibonakala ngamehlo. Faka amavidiyo welimi lezandla ukuze kube nokufinyeleleka okupheleleko.",
      "payment.failed": "Ikhokhelo yehlulekile",
      "payment.success": "Ikhokhelo iphumelele",
      "payment.processing": "Ikhokhelo iyacutshungulwa...",
      "payment.pleaseWait": "Sicela ulinde sisakhangela ikhokhelo yakho.",
      "payment.cancelled": "Ikhokhelo ikhanseliwe.",
      "payment.tryAgain": "Zama godu",
      "payment.verificationFailed": "Ukuqinisekiswa kwekhokhelo kwehlulekile.",
      "payment.notCaptured": "Akukho khokhelo ebanjiweko. Ungazama godu nanyana kunini.",
    },
    sasl: {
      "common.language": "Language",
      "common.selectLanguage": "Select language",
      "common.saslNotice": "SASL mode selected. Provide signed videos for key actions.",
      "payment.failed": "Payment Failed",
      "payment.success": "Payment Successful",
      "payment.processing": "Processing Payment...",
      "payment.pleaseWait": "Please wait while we verify your payment.",
      "payment.cancelled": "Payment cancelled.",
      "payment.tryAgain": "Try Again",
      "payment.verificationFailed": "Payment verification failed.",
      "payment.notCaptured": "No payment was captured. You can try again anytime.",
    },
  };

  const PHRASES_EN = [
    "Upgrade to Unlock",
    "Group Play",
    "Students compete in teams — share a combined score and collaborate",
    "Tournament Mode",
    "Students compete live — real-time leaderboard and instant scoring",
    "Delegated Moderation",
    "Let a trusted student moderate the session on your behalf",
    "Upgrade",
    "Go Live",
    "Share this code with your students",
    "Waiting Room",
    "Waiting for students to join...",
    "Start Session",
    "End Session",
    "SMS Game Invite",
    "Send the game code to a student's phone (E.164 format, e.g. +27831234567).",
    "Game Type (optional)",
    "Send SMS",
    "Elite Player",
    "Premium — Leaderboard",
    "Unlock",
    "© 2026 SlidePlay. All Rights Reserved.",
    "Unlock Elite Features",
    "Elite Quests & Daily Challenges",
    "Double XP & XP Boosts",
    "Exclusive Avatars & Badges",
    "Priority Support or Coaching",
    "Upgrade to Elite",
    "Welcome back,",
    "Ready to unlock your next level?",
    "CURRENT LEVEL",
    "NEXT LEVEL",
    "12 Day Streak",
    "8 Achievements",
    "Elite Rank",
    "Daily Quest",
    "Complete 2 Quests Today",
    "Start Quest",
    "Hours Studied by Game",
    "Study Hours Breakdown",
    "Time by Mode",
    "Time by Mode Breakdown",
    "Upload Slides",
    "Upload your lesson content and we will auto-generate a quiz from it",
    "Drop your file here or",
    "browse",
    "Configure Session",
    "Configure Quiz",
    "Your session code is ready — fine-tune the quiz settings before going live",
    "SESSION CODE",
    "Copy Code",
    "SMS Invite",
    "Session Name",
    "e.g. Physics Chapter 4 Review",
    "Max Students",
    "Difficulty",
    "Easy",
    "Medium",
    "Hard",
    "Questions",
    "Time per Question",
    "Back",
    "Pick a Game",
    "Choose the game your students will play this session",
    "Choose Mode",
    "Session Mode",
    "How will your students experience this session?",
    "FREE",
    "LIVE",
    "Session",
    "No game",
    "Individual",
    "students",
    "Story Mode Quests Started",
    "Weekly Engagement Waveform",
    "Live Feed",
    "Student Tracker",
    "Active Modules",
    "4 Running",
    "7 tasks remaining",
    "2 tasks remaining",
    "Open",
    "EDU Defense Grid",
    "Control Center",
    "Manage student permissions, apply penalties, suspend access, and run moderation actions from one dedicated command page.",
    "Open Access & Discipline Page",
    "Live Sessions",
    "2 Active",
    "Start Broadcasting",
    "Score Distribution",
    "Class Avg",
    "Top bracket (A): 34 students",
    "Upload",
    "Setup",
    "Game",
    "Mode",
    "Launch",
    "Dark",
    "Light",
    "Cyberpunk",
    "Invite Friends",
    "Share SlidePlayer with your classmates",
    "Send Invite",
    "Invite classmates via email",
    "Invite",
    "Share Link",
    "Copy your unique referral link",
    "Copy Link",
    "Today",
    "ELITE PLAYERS",
    "PREMIUM",
    "★ ELITE",
    "SYSTEM COMMS",
    "Faculty Command Center",
    "Attendance",
    "Avg. Grade",
    "Assignments Pending",
    "Generate a live code, pick a game, and have students join in seconds",
    "Up to 200 students",
    "ELITE FEATURE",
    "Unlock This Feature",
    "This feature is available on a paid plan.",
    "Student Elite",
    "Student Premium",
    "BEST VALUE",
    "PAID",
    "Daily Quests & Challenges",
    "XP Boosts & Streak Shields",
    "Unlimited Weekly Uploads",
    "Everything in Elite",
    "Elite Leaderboard Access",
    "Priority Coaching Support",
    "Choose a payment method",
    "Payment handled securely. Your features unlock immediately after payment.",
    "Close",
    "DASHBOARD",
    "LIBRARY",
    "QUESTS",
    "GAME MODE",
    "ANALYTICS",
    "BILLINGS",
    "Join a Class Session",
    "Enter the code your teacher shared to jump into a live session",
    "Enter code (e.g. ABC123)",
    "Join",
    "Home",
    "Features",
    "About",
    "Help",
    "Start Playing",
    "Students",
    "Games Played",
    "Engagement",
    "Explore Features",
    "Everything you need to turn studying into a game.",
    "Real Games",
    "Learn through gameplay, not boring memorisation.",
    "AI Quiz Engine",
    "Smart quizzes generated from your content.",
    "Study Modes",
    "Competitive or chill learning modes.",
    "Progress Tracking",
    "Monitor growth, mastery, and streaks.",
    "Compete with classmates in challenges.",
    "Notifications",
    "Premium",
    "Paid feature. Upgrade to access.",
    "Upload different file",
    "Student avatar",
    "Rewards",
    "Unlock perks, badges, and privileges.",
    "Select",
    "Cancel",
    "+ Add Player",
    "Login",
    "LOGIN",
    "Welcome Back",
    "Continue your learning journey",
    "Create Account",
    "Sign In",
    "Sign Up",
    "Sign up with Google",
    "Login with Google",
    "Forgot Password?",
    "Continue with Google",
    "Email Address",
    "Enter email",
    "Enter password",
    "Show password",
    "Password",
    "Confirm Password",
    "Full Name",
    "Username",
    "Email",
    "Phone Number",
    "Join SlidePlay and start learning smarter",
    "Teacher Access Code",
    "Already have an account?",
    "Don't have an account?",
    "Teacher",
    "Student",
    "OR",
    "Upload More",
    "Guest",
    "Select Game Format",
    "Game Format",
    "How do you want to play?",
    "Choose a game mode before launching",
    "Solo",
    "Multiplayer",
    "Tournament",
    "Add Player",
    "Launch Game",
    "Coming Soon",
    "Teacher Dashboard",
    "Student Dashboard",
    "Dashboard",
    "Library",
    "Analytics",
    "Settings",
    "Billing & Plans",
    "Pay with PayFast",
    "Pay with Stripe",
    "Pay with Crypto",
    "Payment Successful!",
    "Payment Failed",
    "Try Again",
    "Go to Dashboard",
    "View Invoices",
    "Start Learning",
    "Start Quiz",
    "Search class, student, module...",
    "SEARCH QUESTS...",
    "Loading motivation...",
    "Deploy Class Session",
    "Create Session",
    "Resource Upload",
    "Curriculum Library",
    "Performance Analytics",
    "Student Access Grid",
    "Admin Controls",
    "Billing",
    "Plans",
  ];

  const PHRASE_TRANSLATIONS = {
    zu: {
      "Upgrade to Unlock": "Nyusela ukuze uvule",
      "Group Play": "Ukudlala ngeqembu",
      "Students compete in teams — share a combined score and collaborate": "Abafundi bancintisana ngamaqembu — babelane ngamamaki ahlanganisiwe futhi basebenzisane.",
      "Tournament Mode": "Imodi yomqhudelwano",
      "Students compete live — real-time leaderboard and instant scoring": "Abafundi bancintisana bukhoma — ibhodi lamaphuzu lesikhathi sangempela namamaki asheshayo.",
      "Delegated Moderation": "Ukulawula okuthunyelwe",
      "Let a trusted student moderate the session on your behalf": "Vumela umfundi othembekile alawule iseshini egameni lakho",
      "Upgrade": "Nyusela",
      "Go Live": "Yiya bukhoma",
      "Share this code with your students": "Yabelana ngale khodi nabafundi bakho",
      "Waiting Room": "Igumbi lokulinda",
      "Waiting for students to join...": "Kulindwe abafundi ukuthi bajoyine...",
      "Start Session": "Qala iseshini",
      "End Session": "Phetha iseshini",
      "SMS Game Invite": "Isimemo somdlalo se-SMS",
      "Send the game code to a student's phone (E.164 format, e.g. +27831234567).": "Thumela ikhodi yomdlalo ocingweni lomfundi (ifomethi ye-E.164, isb. +27831234567).",
      "Game Type (optional)": "Uhlobo lomdlalo (okungakhethwa)",
      "Send SMS": "Thumela i-SMS",
      "Elite Player": "Umdlali we-Elite",
      "Premium — Leaderboard": "Premium — Ibhodi lamaphuzu",
      "Unlock": "Vula",
      "© 2026 SlidePlay. All Rights Reserved.": "© 2026 SlidePlay. Wonke amalungelo agodliwe.",
      "Unlock Elite Features": "Vula izici ze-Elite",
      "Elite Quests & Daily Challenges": "Imisebenzi ye-Elite nezinselelo zansuku zonke",
      "Double XP & XP Boosts": "I-XP ephindwe kabili namaboost e-XP",
      "Exclusive Avatars & Badges": "Ama-avatar namabheji akhethekile",
      "Priority Support or Coaching": "Usizo oluphambili noma ukuqeqeshwa",
      "Upgrade to Elite": "Nyusela ku-Elite",
      "Welcome back,": "Siyakwamukela futhi,",
      "Ready to unlock your next level?": "Usukulungele ukuvula izinga lakho elilandelayo?",
      "CURRENT LEVEL": "IZINGA LAMANJE",
      "NEXT LEVEL": "IZINGA ELILANDELAYO",
      "12 Day Streak": "Uchungechunge lwezinsuku eziyi-12",
      "8 Achievements": "Impumelelo eziyi-8",
      "Elite Rank": "Izinga le-Elite",
      "Daily Quest": "Umsebenzi wansuku zonke",
      "Complete 2 Quests Today": "Qedela imisebenzi emi-2 namuhla",
      "Start Quest": "Qala umsebenzi",
      "Hours Studied by Game": "Amahora okufunda ngomdlalo",
      "Study Hours Breakdown": "Ukuhlukaniswa kwamahora okufunda",
      "Time by Mode": "Isikhathi ngemodi",
      "Time by Mode Breakdown": "Ukuhlukaniswa kwesikhathi ngemodi",
      "Upload Slides": "Layisha amaslayidi",
      "Upload your lesson content and we will auto-generate a quiz from it": "Layisha okuqukethwe kwesifundo sakho bese sakhela i-quiz ngokuzenzakalelayo.",
      "Drop your file here or": "Donsela ifayela lakho lapha noma",
      "browse": "phequlula",
      "Configure Session": "Hlela iseshini",
      "Configure Quiz": "Hlela i-quiz",
      "Your session code is ready — fine-tune the quiz settings before going live": "Ikhodi yeseshini isilungile — lungisa izilungiselelo ze-quiz ngaphambi kokuqalisa.",
      "SESSION CODE": "IKHODI YESESHINI",
      "Copy Code": "Kopisha ikhodi",
      "SMS Invite": "Isimemo se-SMS",
      "Session Name": "Igama leseshini",
      "e.g. Physics Chapter 4 Review": "isb. Ukubuyekeza i-Physics Isahluko 4",
      "Max Students": "Inani eliphezulu labafundi",
      "Difficulty": "Ubunzima",
      "Easy": "Kulula",
      "Medium": "Maphakathi",
      "Hard": "Kunzima",
      "Questions": "Imibuzo",
      "Time per Question": "Isikhathi ngomusho",
      "Back": "Emuva",
      "Pick a Game": "Khetha umdlalo",
      "Choose the game your students will play this session": "Khetha umdlalo abafundi bakho abazowudlala kule seshini",
      "Choose Mode": "Khetha imodi",
      "Session Mode": "Imodi yeseshini",
      "How will your students experience this session?": "Abafundi bakho bazoyithola kanjani le seshini?",
      "FREE": "MAHHALA",
      "LIVE": "BUKHOMA",
      "Session": "Iseshini",
      "No game": "Awukho umdlalo",
      "Individual": "Ngamunye",
      "students": "abafundi",
      "Story Mode Quests Started": "Imisebenzi ye-Story Mode eqaliwe",
      "Weekly Engagement Waveform": "Igagasi lokubandakanyeka kweviki",
      "Live Feed": "Okubukhoma",
      "Student Tracker": "Ukulandelela abafundi",
      "Active Modules": "Amamojula asebenzayo",
      "4 Running": "4 Iyasebenza",
      "7 tasks remaining": "Kusele imisebenzi engu-7",
      "2 tasks remaining": "Kusele imisebenzi engu-2",
      "Open": "Vula",
      "EDU Defense Grid": "Igridi yokuvikela yezemfundo",
      "Control Center": "Isikhungo sokulawula",
      "Manage student permissions, apply penalties, suspend access, and run moderation actions from one dedicated command page.": "Phatha izimvume zabafundi, sebenzisa izinhlawulo, misa ukufinyelela, futhi uqhube izenzo zokulawula ekhasini elilodwa.",
      "Open Access & Discipline Page": "Vula ikhasi lokufinyelela nesiyalo",
      "Live Sessions": "Amaseshini abukhoma",
      "2 Active": "2 Ayasebenza",
      "Start Broadcasting": "Qala ukusakaza",
      "Score Distribution": "Ukusatshalaliswa kwamamaki",
      "Class Avg": "Isilinganiso sekilasi",
      "Top bracket (A): 34 students": "Iqoqo eliphezulu (A): abafundi abangu-34",
      "Upload": "Layisha",
      "Setup": "Hlela",
      "Game": "Umdlalo",
      "Mode": "Imodi",
      "Launch": "Qalisa",
      "Dark": "Mnyama",
      "Light": "Khanya",
      "Cyberpunk": "I-Cyberpunk",
      "Invite Friends": "Mema abangani",
      "Share SlidePlayer with your classmates": "Yabelana ngeSlidePlayer nofunda nabo",
      "Send Invite": "Thumela isimemo",
      "Invite classmates via email": "Mema ofunda nabo nge-imeyili",
      "Invite": "Mema",
      "Share Link": "Yabelana ngesixhumanisi",
      "Copy your unique referral link": "Kopisha isixhumanisi sakho sokudlulisa esiyingqayizivele",
      "Copy Link": "Kopisha isixhumanisi",
      "Today": "Namuhla",
      "ELITE PLAYERS": "ABADLALI BE-ELITE",
      "PREMIUM": "PREMIUM",
      "★ ELITE": "★ ELITE",
      "SYSTEM COMMS": "IMILAYEZO YESISTIMU",
      "Faculty Command Center": "Isikhungo sokulawula sothisha",
      "Attendance": "Ukuhambela",
      "Avg. Grade": "Isilinganiso samamaki",
      "Assignments Pending": "Imisebenzi elindile",
      "Generate a live code, pick a game, and have students join in seconds": "Khiqiza ikhodi ebukhoma, khetha umdlalo, abafundi bajoyine ngemizuzwana.",
      "Up to 200 students": "Kuze kufike kubafundi abangu-200",
      "ELITE FEATURE": "ISICI SE-ELITE",
      "Unlock This Feature": "Vula lesi sici",
      "This feature is available on a paid plan.": "Lesi sici sitholakala ohlelweni olukhokhelwayo.",
      "Student Elite": "Umfundi Elite",
      "Student Premium": "Umfundi Premium",
      "BEST VALUE": "INANI ELINGCONO",
      "PAID": "IKHOKHELWE",
      "Daily Quests & Challenges": "Imisebenzi yansuku zonke nezinselelo",
      "XP Boosts & Streak Shields": "Ama-boost e-XP nezivikelo zochungechunge",
      "Unlimited Weekly Uploads": "Ukulayisha kwamasonto onke okungenamkhawulo",
      "Everything in Elite": "Konke okuse-Elite",
      "Elite Leaderboard Access": "Ukufinyelela ku-Leaderboard ye-Elite",
      "Priority Coaching Support": "Ukusekelwa kokuqeqeshwa okuphambili",
      "Choose a payment method": "Khetha indlela yokukhokha",
      "Payment handled securely. Your features unlock immediately after payment.": "Inkokhelo iphethwe ngokuphepha. Izici zakho zivuleka ngokushesha ngemva kokukhokha.",
      "Close": "Vala",
      "DASHBOARD": "IDESHIBHODI",
      "LIBRARY": "UMTAPO",
      "QUESTS": "IMISEBENZI",
      "GAME MODE": "IMODI YOMDLALO",
      "ANALYTICS": "UKUHLAZIYA",
      "BILLINGS": "IZINKOKHELO",
      "Join a Class Session": "Joyina iseshini yekilasi",
      "Enter the code your teacher shared to jump into a live session": "Faka ikhodi oyinikezwe uthisha ukuze ujoyine iseshini ebukhoma",
      "Enter code (e.g. ABC123)": "Faka ikhodi (isb. ABC123)",
      "Join": "Joyina",
      "Home": "Ikhaya",
      "Features": "Izici",
      "About": "Mayelana",
      "Help": "Usizo",
      "Start Playing": "Qala ukudlala",
      "Students": "Abafundi",
      "Games Played": "Imidlalo edlaliwe",
      "Engagement": "Ukubandakanyeka",
      "Explore Features": "Hlola izici",
      "Everything you need to turn studying into a game.": "Konke okudingayo ukuguqula ukufunda kube umdlalo.",
      "Real Games": "Imidlalo yangempela",
      "Learn through gameplay, not boring memorisation.": "Funda ngokudlala, hhayi ngokukhumbula okudikayo.",
      "AI Quiz Engine": "Injini ye-quiz ye-AI",
      "Smart quizzes generated from your content.": "Ama-quiz ahlakaniphile akhiqizwe kokuqukethwe kwakho.",
      "Study Modes": "Izindlela zokufunda",
      "Competitive or chill learning modes.": "Izindlela zokufunda zokuncintisana noma ezithule.",
      "Progress Tracking": "Ukulandelela inqubekela phambili",
      "Monitor growth, mastery, and streaks.": "Landelela ukukhula, ubuchule, namastreak.",
      "Compete with classmates in challenges.": "Ncintisana nabafunda nawe ezinseleleni.",
      "Notifications": "Izaziso",
      "Premium": "Iphremiyamu",
      "Paid feature. Upgrade to access.": "Isici esikhokhelwayo. Nyusela ukuze ufinyelele.",
      "Upload different file": "Layisha ifayela elihlukile",
      "Student avatar": "Isithombe somfundi",
      "Rewards": "Imiklomelo",
      "Unlock perks, badges, and privileges.": "Vula izinzuzo, amabheji, namalungelo.",
      "Select": "Khetha",
      "Cancel": "Khansela",
      "+ Add Player": "+ Engeza umdlali",
      "Login": "Ngena",
      "LOGIN": "NGENA",
      "Welcome Back": "Siyakwamukela futhi",
      "Continue your learning journey": "Qhubeka nohambo lwakho lokufunda",
      "Create Account": "Dala i-akhawunti",
      "Sign In": "Ngena",
      "Sign Up": "Bhalisa",
      "Sign up with Google": "Bhalisa nge-Google",
      "Login with Google": "Ngena nge-Google",
      "Forgot Password?": "Ukhohlwe iphasiwedi?",
      "Continue with Google": "Qhubeka nge-Google",
      "Email Address": "Ikheli le-imeyili",
      "Enter email": "Faka i-imeyili",
      "Enter password": "Faka iphasiwedi",
      "Show password": "Bonisa iphasiwedi",
      "Password": "Iphasiwedi",
      "Confirm Password": "Qinisekisa iphasiwedi",
      "Full Name": "Igama eligcwele",
      "Username": "Igama lomsebenzisi",
      "Email": "I-imeyili",
      "Phone Number": "Inombolo yocingo",
      "Join SlidePlay and start learning smarter": "Joyina i-SlidePlay uqale ukufunda ngobuhlakani",
      "Teacher Access Code": "Ikhodi yokungena kathisha",
      "Already have an account?": "Usunayo i-akhawunti?",
      "Don't have an account?": "Awunayo i-akhawunti?",
      "Teacher": "Uthisha",
      "Student": "Umfundi",
      "OR": "NOMA",
      "Upload More": "Layisha okwengeziwe",
      "Guest": "Isivakashi",
      "Select Game Format": "Khetha ifomethi yomdlalo",
      "Game Format": "Ifomethi yomdlalo",
      "How do you want to play?": "Ufuna ukudlala kanjani?",
      "Choose a game mode before launching": "Khetha imodi yomdlalo ngaphambi kokuqala",
      "Solo": "Wedwa",
      "Multiplayer": "Abadlali abaningi",
      "Tournament": "Umqhudelwano",
      "Add Player": "Engeza umdlali",
      "Launch Game": "Qala umdlalo",
      "Coming Soon": "Kuza maduze",
      "Teacher Dashboard": "Ideshibhodi Yothisha",
      "Student Dashboard": "Ideshibhodi Yomfundi",
      "Dashboard": "Ideshibhodi",
      "Library": "Umtapo",
      "Analytics": "Ukuhlaziya",
      "Settings": "Izilungiselelo",
      "Billing & Plans": "Izinkokhelo Nezinhlelo",
      "Pay with PayFast": "Khokha ngePayFast",
      "Pay with Stripe": "Khokha ngeStripe",
      "Pay with Crypto": "Khokha nge-Crypto",
      "Payment Successful!": "Inkokhelo iphumelele!",
      "Payment Failed": "Inkokhelo yehlulekile",
      "Try Again": "Zama futhi",
      "Go to Dashboard": "Iya ku-dashboard",
      "View Invoices": "Buka ama-invoyisi",
      "Start Learning": "Qala ukufunda",
      "Start Quiz": "Qala i-quiz",
      "Search class, student, module...": "Sesha ikilasi, umfundi, imojula...",
      "SEARCH QUESTS...": "SESHA IMISEBENZI...",
      "Loading motivation...": "Kulayishwa ugqozi...",
      "Deploy Class Session": "Qalisa iseshini yekilasi",
      "Create Session": "Dala iseshini",
      "Resource Upload": "Layisha izinsiza",
      "Curriculum Library": "Umtapo wekharikhulamu",
      "Performance Analytics": "Ukuhlaziya ukusebenza",
      "Student Access Grid": "Igridi yokufinyelela kwabafundi",
      "Admin Controls": "Izilawuli zomphathi",
      "Billing": "Izinkokhelo",
      "Plans": "Izinhlelo",
    },
    xh: {
      "Unlock Elite Features": "Vula iimpawu ze-Elite",
      "Elite Quests & Daily Challenges": "Imisebenzi ye-Elite neengxaki zemihla ngemihla",
      "Double XP & XP Boosts": "I-XP ephindwe kabini kunye neebhusthi ze-XP",
      "Exclusive Avatars & Badges": "Ii-avatar neebheji ezikhethekileyo",
      "Advanced Analytics": "Uhlalutyo oluphambili",
      "Elite Leaderboard": "Ibhodi yabaphambili ye-Elite",
      "Achievement Showcase": "Umboniso weempumelelo",
      "Custom Themes & Effects": "Imixholo kunye neziphumo zesiko",
      "Priority Support or Coaching": "Inkxaso ephambili okanye uqeqesho",
      "Daily Quests & Challenges": "Imisebenzi yemihla ngemihla neengxaki",
      "XP Boosts & Streak Shields": "Iibhonasi ze-XP kunye nezikhuselo zestreak",
      "Unlimited Weekly Uploads": "Ulayisho lweveki olungenamda",
      "Everything in Elite": "Yonke into ekwi-Elite",
      "Elite Leaderboard Access": "Ufikelelo kwi-leaderboard ye-Elite",
      "Priority Coaching Support": "Inkxaso yokuqeqesha ephambili",
      "PAID": "IHLAWULIWE",
      "Upgrade to Elite": "Nyusela kwi-Elite",
      "Welcome back,": "Wamkelekile kwakhona,",
      "Ready to unlock your next level?": "Ukulungele ukuvula inqanaba lakho elilandelayo?",
      "CURRENT LEVEL": "INQANABA LANGOKU",
      "NEXT LEVEL": "INQANABA ELILANDELAYO",
      "Daily Quest": "Umsebenzi wemihla ngemihla",
      "Start Quest": "Qala umsebenzi",
      "Hours Studied by Game": "Iiyure ezifundwe ngomdlalo",
      "Time by Mode": "Ixesha ngemowudi",
      "Time by Mode Breakdown": "Ukwahlulwa kwexesha ngemowudi",
      "Configure Quiz": "Lungisa i-quiz",
      "Configure Session": "Lungisa iseshoni",
      "Session Name": "Igama leseshoni",
      "Max Students": "Abafundi abaninzi",
      "Difficulty": "Ubunzima",
      "Easy": "Kulula",
      "Medium": "Phakathi",
      "Hard": "Kunzima",
      "Questions": "Imibuzo",
      "Time per Question": "Ixesha ngombuzo",
      "Back": "Emva",
      "Pick a Game": "Khetha umdlalo",
      "Choose the game your students will play this session": "Khetha umdlalo abafundi bakho abaza kuwudlala kule seshoni",
      "Choose Mode": "Khetha imowudi",
      "Session Mode": "Imowudi yeseshoni",
      "How will your students experience this session?": "Abafundi bakho baza kuyifumana njani le seshoni?",
      "FREE": "SIMAHLA",
      "LIVE": "BUPHILA",
      "Session": "Iseshoni",
      "No game": "Akukho mdlalo",
      "Individual": "Ngamnye",
      "students": "abafundi",
      "Story Mode Quests Started": "Imisebenzi ye-Story Mode eqaliweyo",
      "Individual Play": "Umdlalo ngamnye",
      "Group Play": "Umdlalo weqela",
      "Tournament Mode": "Imowudi yetumente",
      "Upgrade to Unlock": "Nyusela ukuvula",
      "Delegated Moderation": "Ulawulo oludluliselweyo",
      "Share this code with your students": "Yabelana ngale khowudi nabafundi bakho",
      "Waiting Room": "Igumbi lokulinda",
      "Start Session": "Qala iseshoni",
      "End Session": "Phelisa iseshoni",
      "SMS Game Invite": "Isimemo somdlalo nge-SMS",
      "Send SMS": "Thumela i-SMS",
      "Unlock": "Vula",
      "Premium — Leaderboard": "Premium — Ibhodi yabaphambili",
      "Elite Player": "Umdlali we-Elite",
      "SYSTEM COMMS": "UNXIBELELWANO LWENKQUBO",
      "Notifications": "Izaziso",
      "Premium": "Ipremiyamu",
      "Paid feature. Upgrade to access.": "Inqaku elihlawulelwayo. Nyusela ukuze ufikelele.",
      "Upload different file": "Layisha ifayile eyahlukileyo",
      "Student avatar": "I-avatar yomfundi",
      "Login": "Ngena",
      "LOGIN": "NGENA",
      "Welcome Back": "Wamkelekile kwakhona",
      "Continue your learning journey": "Qhubeka nohambo lwakho lokufunda",
      "Create Account": "Yenza iakhawunti",
      "Sign In": "Ngena",
      "Sign Up": "Bhalisa",
      "Sign up with Google": "Bhalisa ngeGoogle",
      "Login with Google": "Ngena ngeGoogle",
      "Forgot Password?": "Ulibele igama lokugqitha?",
      "Continue with Google": "Qhubeka ngeGoogle",
      "Email Address": "Idilesi ye-imeyile",
      "Enter email": "Faka i-imeyile",
      "Enter password": "Faka igama lokugqitha",
      "Show password": "Bonisa igama lokugqitha",
      "Password": "Igama lokugqitha",
      "Confirm Password": "Qinisekisa igama lokugqitha",
      "Full Name": "Igama elipheleleyo",
      "Username": "Igama lomsebenzisi",
      "Email": "I-imeyile",
      "Phone Number": "Inombolo yefowuni",
      "Join SlidePlay and start learning smarter": "Joyina iSlidePlay uqalise ukufunda ngobulumko",
      "Teacher Access Code": "Ikhowudi yokungena kotitshala",
      "Teacher": "Utitshala",
      "Student": "Umfundi",
      "OR": "OKANYE",
      "Upload More": "Layisha ngakumbi",
      "Guest": "Undwendwe",
      "Select Game Format": "Khetha ifomathi yomdlalo",
      "Game Format": "Ifomathi yomdlalo",
      "Solo": "Wedwa",
      "Multiplayer": "Abadlali abaninzi",
      "Tournament": "Itumente",
      "Coming Soon": "Iza kungekudala",
      "© 2026 SlidePlay. All Rights Reserved.": "© 2026 SlidePlay. Onke amalungelo agciniwe."
    },
    af: {
      "Unlock Elite Features": "Ontsluit Elite-kenmerke",
      "Elite Quests & Daily Challenges": "Elite-soektogte en daaglikse uitdagings",
      "Double XP & XP Boosts": "Dubbele XP en XP-versterkers",
      "Exclusive Avatars & Badges": "Eksklusiewe avatars en kentekens",
      "Advanced Analytics": "Gevorderde analise",
      "Elite Leaderboard": "Elite ranglys",
      "Achievement Showcase": "Prestasie-uitstalling",
      "Custom Themes & Effects": "Pasgemaakte temas en effekte",
      "Priority Support or Coaching": "Prioriteitsondersteuning of afrigting",
      "Daily Quests & Challenges": "Daaglikse soektogte en uitdagings",
      "XP Boosts & Streak Shields": "XP-versterkers en reeks-skilde",
      "Unlimited Weekly Uploads": "Onbeperkte weeklikse oplaaie",
      "Everything in Elite": "Alles in Elite",
      "Elite Leaderboard Access": "Toegang tot Elite-ranglys",
      "Priority Coaching Support": "Prioriteit-afrigtingsondersteuning",
      "PAID": "BETAALD",
      "Upgrade to Elite": "Gradeer op na Elite",
      "Welcome back,": "Welkom terug,",
      "Ready to unlock your next level?": "Gereed om jou volgende vlak te ontsluit?",
      "CURRENT LEVEL": "HUIDIGE VLAK",
      "NEXT LEVEL": "VOLGENDE VLAK",
      "Daily Quest": "Daaglikse soektog",
      "Start Quest": "Begin soektog",
      "Hours Studied by Game": "Ure gestudeer per speletjie",
      "Time by Mode": "Tyd per modus",
      "Time by Mode Breakdown": "Uitleg van tyd per modus",
      "Configure Quiz": "Stel vasvra op",
      "Configure Session": "Stel sessie op",
      "Session Name": "Sessienaam",
      "Max Students": "Maks studente",
      "Difficulty": "Moeilikheid",
      "Easy": "Maklik",
      "Medium": "Gemiddeld",
      "Hard": "Moeilik",
      "Questions": "Vrae",
      "Time per Question": "Tyd per vraag",
      "Back": "Terug",
      "Pick a Game": "Kies 'n speletjie",
      "Choose the game your students will play this session": "Kies die speletjie wat jou studente in hierdie sessie sal speel",
      "Choose Mode": "Kies modus",
      "Session Mode": "Sessie-modus",
      "How will your students experience this session?": "Hoe sal jou studente hierdie sessie ervaar?",
      "FREE": "GRATIS",
      "LIVE": "REGSTREEKS",
      "Session": "Sessie",
      "No game": "Geen speletjie",
      "Individual": "Individueel",
      "students": "studente",
      "Story Mode Quests Started": "Story Mode-soektogte begin",
      "Individual Play": "Individuele spel",
      "Group Play": "Groepspel",
      "Tournament Mode": "Toernooimodus",
      "Upgrade to Unlock": "Gradeer op om te ontsluit",
      "Delegated Moderation": "Gedelegeerde moderering",
      "Share this code with your students": "Deel hierdie kode met jou studente",
      "Waiting Room": "Wagkamer",
      "Start Session": "Begin sessie",
      "End Session": "Beëindig sessie",
      "SMS Game Invite": "SMS-speletjie-uitnodiging",
      "Send SMS": "Stuur SMS",
      "Unlock": "Ontsluit",
      "Premium — Leaderboard": "Premium — Ranglys",
      "Elite Player": "Elite-speler",
      "SYSTEM COMMS": "STELSELKOMMUNIKASIE",
      "Notifications": "Kennisgewings",
      "Premium": "Premium",
      "Paid feature. Upgrade to access.": "Betaalde funksie. Gradeer op vir toegang.",
      "Upload different file": "Laai ander lêer op",
      "Student avatar": "Student-avatar",
      "Login": "Teken in",
      "LOGIN": "MELD AAN",
      "Welcome Back": "Welkom terug",
      "Continue your learning journey": "Gaan voort met jou leerreis",
      "Create Account": "Skep rekening",
      "Sign In": "Meld aan",
      "Sign Up": "Registreer",
      "Sign up with Google": "Registreer met Google",
      "Login with Google": "Meld aan met Google",
      "Forgot Password?": "Wagwoord vergeet?",
      "Continue with Google": "Gaan voort met Google",
      "Email Address": "E-posadres",
      "Enter email": "Voer e-pos in",
      "Enter password": "Voer wagwoord in",
      "Show password": "Wys wagwoord",
      "Password": "Wagwoord",
      "Confirm Password": "Bevestig wagwoord",
      "Full Name": "Volle naam",
      "Username": "Gebruikersnaam",
      "Email": "E-pos",
      "Phone Number": "Telefoonnommer",
      "Join SlidePlay and start learning smarter": "Sluit by SlidePlay aan en begin slimmer leer",
      "Teacher Access Code": "Onderwyser toegangskode",
      "Teacher": "Onderwyser",
      "Student": "Student",
      "OR": "OF",
      "Upload More": "Laai meer op",
      "Guest": "Gas",
      "Select Game Format": "Kies speelformaat",
      "Game Format": "Speelformaat",
      "Solo": "Alleen",
      "Multiplayer": "Veelspeler",
      "Tournament": "Toernooi",
      "Coming Soon": "Binnekort",
      "© 2026 SlidePlay. All Rights Reserved.": "© 2026 SlidePlay. Alle regte voorbehou."
    },
    nso: {
      "PAID": "E LEFILWEGO",
      "PREMIUM": "PREMIUM",
      "Premium": "PREMIUM",
      "FREE": "MAHALA",
      "Notifications": "Ditsebišo",
      "Paid feature. Upgrade to access.": "Sebopego sa tefo. Godiša gore o hwetše phihlelelo.",
      "Upload different file": "Laiša faele ye nngwe",
      "Student avatar": "Seswantšho sa moithuti",
      "Pick a Game": "Kgetha papadi",
      "Choose the game your students will play this session": "Kgetha papadi yeo baithuti ba gago ba tla e bapalago ka seseneng se",
      "Choose Mode": "Kgetha mokgwa",
      "Session Mode": "Mokgwa wa sesene",
      "How will your students experience this session?": "Baithuti ba gago ba tla itemogela sesene se bjang?",
      "LIVE": "PHELA",
      "Session": "Sesene",
      "No game": "Ga go papadi",
      "Individual": "Mongwe ka mongwe",
      "students": "baithuti",
      "Story Mode Quests Started": "Dikgwetlho tsa Story Mode di thomile",
      "Waiting Room": "Phapoši ya go leta",
      "Start Session": "Thoma sesene",
      "End Session": "Fetsa sesene"
    },
    tn: {
      "Home": "Gae",
      "Features": "Dikarolo",
      "About": "Ka ga",
      "Help": "Thuso",
      "Start Playing": "Simolola go tshameka",
      "Students": "Baithuti",
      "Games Played": "Metshameko e e tshamekilweng",
      "Engagement": "Boitlamo",
      "Explore Features": "Sekaseka dikarolo",
      "PAID": "GO DUELETSWE",
      "PREMIUM": "PREMIUM",
      "Premium": "PREMIUM",
      "FREE": "MAHALA",
      "Notifications": "Dikitsiso",
      "Paid feature. Upgrade to access.": "Karolo e e duelwang. Tlhatlhosa gore o kgone go tsena.",
      "Upload different file": "Tsenya faele e nngwe",
      "Student avatar": "Setshwantsho sa moithuti",
      "Pick a Game": "Tlhopha motshameko",
      "Choose the game your students will play this session": "Tlhopha motshameko o baithuti ba gago ba tla o tshamekang mo thutong eno",
      "Choose Mode": "Tlhopha mokgwa",
      "Session Mode": "Mokgwa wa thuto",
      "How will your students experience this session?": "Baithuti ba gago ba tla itemogela thuto eno jang?",
      "LIVE": "MOWENG",
      "Session": "Thuto",
      "No game": "Ga go motshameko",
      "Individual": "Mongwe ka mongwe",
      "students": "baithuti",
      "Story Mode Quests Started": "Dikgwetlho tsa Story Mode di simolotse",
      "Waiting Room": "Kamore ya go leta",
      "Start Session": "Simolola thuto",
      "End Session": "Fetsa thuto"
    },
    st: {
      "Home": "Lehae",
      "Features": "Dikarolo",
      "About": "Mabapi",
      "Help": "Thuso",
      "Start Playing": "Qala ho bapala",
      "Students": "Baithuti",
      "Games Played": "Dipapadi tse bapadilweng",
      "Engagement": "Boitlamo",
      "Explore Features": "Hlahloba dikarolo",
      "PAID": "E LEFILWE",
      "PREMIUM": "PREMIUM",
      "Premium": "PREMIUM",
      "FREE": "MAHALA",
      "Notifications": "Ditsebiso",
      "Paid feature. Upgrade to access.": "Karolo e lefilweng. Nyolla ho fumana phihlello.",
      "Upload different file": "Laela faele e fapaneng",
      "Student avatar": "Avatar ya moithuti",
      "Pick a Game": "Kgetha papadi",
      "Choose the game your students will play this session": "Kgetha papadi eo baithuti ba hao ba tla e bapalang thutong ena",
      "Choose Mode": "Kgetha mokgwa",
      "Session Mode": "Mokgwa wa thuto",
      "How will your students experience this session?": "Baithuti ba hao ba tla ikutlwa jwang thutong ena?",
      "LIVE": "PHELA",
      "Session": "Thuto",
      "No game": "Ha ho papadi",
      "Individual": "Motho ka mong",
      "students": "baithuti",
      "Story Mode Quests Started": "Dikgwetlho tsa Story Mode di qadile",
      "Waiting Room": "Kamore ya ho emela",
      "Start Session": "Qala thuto",
      "End Session": "Qeta thuto"
    },
    ts: {
      "Home": "Kaya",
      "Features": "Swihlawulekisi",
      "About": "Mayelana",
      "Help": "Mpfuneto",
      "Start Playing": "Sungula ku tlanga",
      "Students": "Vadyondzi",
      "Games Played": "Mintlangu leyi tlangiweke",
      "Engagement": "Ntirhisano",
      "Explore Features": "Kambisisa swihlawulekisi"
    },
    ss: {
      "Home": "Likhaya",
      "Features": "Tici",
      "About": "Mayelana",
      "Help": "Sita",
      "Start Playing": "Cala kudlala",
      "Students": "Bafundzi",
      "Games Played": "Imidlalo ledlaliwe",
      "Engagement": "Kutinikela",
      "Explore Features": "Hlola tici"
    },
    ve: {
      "Home": "Hayani",
      "Features": "Zwipiḓa",
      "About": "Nga ha",
      "Help": "Thuso",
      "Start Playing": "Thomani u tamba",
      "Students": "Vhagudiswa",
      "Games Played": "Mitambo yo tambiwaho",
      "Engagement": "U dzhenelela",
      "Explore Features": "Sedzulusani zwipiḓa"
    },
    nr: {
      "Home": "Ekhaya",
      "Features": "Iingcezu",
      "About": "Ngathi",
      "Help": "Sizo",
      "Start Playing": "Qala ukudlala",
      "Students": "Abafundi",
      "Games Played": "Imidlalo edlaliweko",
      "Engagement": "Ukuzibandakanya",
      "Explore Features": "Hlola iingcezu"
    },
  };

  const PHRASE_DICT = Object.keys(SUPPORTED).reduce(function (acc, lang) {
    const custom = PHRASE_TRANSLATIONS[lang] || {};
    acc[lang] = {};
    PHRASES_EN.forEach(function (phrase) {
      acc[lang][phrase] = Object.prototype.hasOwnProperty.call(custom, phrase)
        ? custom[phrase]
        : phrase;
    });
    return acc;
  }, {});

  const TITLE_TRANSLATIONS = {
    zu: {
      "Login | SlidePlay": "Ngena | SlidePlay",
      "SlidePlay - Sign Up": "SlidePlay - Bhalisa",
      "Select Game Format": "Khetha ifomethi yomdlalo",
      "Teacher Dashboard": "Ideshibhodi Yothisha",
    },
    xh: {
      "Login | SlidePlay": "Ngena | SlidePlay",
      "SlidePlay - Sign Up": "SlidePlay - Bhalisa",
      "Select Game Format": "Khetha ifomathi yomdlalo",
      "Teacher Dashboard": "Ideshibhodi Yotitshala",
    },
    af: {
      "Login | SlidePlay": "Meld aan | SlidePlay",
      "SlidePlay - Sign Up": "SlidePlay - Registreer",
      "Select Game Format": "Kies speelformaat",
      "Teacher Dashboard": "Onderwyser Dashboard",
    },
  };

  const ORIGINAL_TEXT_NODES = new WeakMap();
  const WORD_GLOSSARY_CACHE = {};
  const MT_CACHE_KEY = "sp_mt_cache_v1";
  const BRAND_TERMS = ["SlidePlay", "SlidePlayer"];
  let mtApplyToken = 0;

  const MOJIBAKE_MAP = {
    "Â©": "(c)",
    "â€”": "-",
    "â€“": "-",
    "â€™": "'",
    "â€˜": "'",
    "â€œ": '"',
    "â€": '"',
    "â€¦": "...",
    "â€¢": "*",
    "â€º": ">",
    "âœ•": "x",
    "âœ“": "OK",
    "âš¡": "",
  };

  function sanitizeMojibakeText(value) {
    let text = String(value == null ? "" : value);
    Object.keys(MOJIBAKE_MAP).forEach(function (bad) {
      if (text.indexOf(bad) > -1) {
        text = text.split(bad).join(MOJIBAKE_MAP[bad]);
      }
    });

    // Common emoji mojibake prefix sequence (example: "ðŸŽ®").
    text = text.replace(/ðŸ[\u0080-\u00BF]{2,}/g, "");
    return text;
  }

  function escapeRegExp(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function maskBrandTerms(text) {
    let masked = String(text || "");
    const tokenMap = {};
    let idx = 0;
    BRAND_TERMS.forEach(function (term) {
      const re = new RegExp(escapeRegExp(term), "gi");
      masked = masked.replace(re, function (match) {
        const token = "¤" + idx++ + "¤";
        tokenMap[token] = match;
        return token;
      });
    });
    return { masked: masked, tokenMap: tokenMap };
  }

  function unmaskBrandTerms(text, tokenMap) {
    let restored = String(text || "");
    Object.keys(tokenMap || {}).forEach(function (token) {
      restored = restored.split(token).join(tokenMap[token]);
    });
    return restored;
  }

  function loadMtCache() {
    try {
      return JSON.parse(localStorage.getItem(MT_CACHE_KEY) || "{}") || {};
    } catch (_err) {
      return {};
    }
  }

  const MT_CACHE = loadMtCache();

  function saveMtCache() {
    try {
      localStorage.setItem(MT_CACHE_KEY, JSON.stringify(MT_CACHE));
    } catch (_err) {
      // ignore storage quota issues
    }
  }

  function extractWordsAscii(str) {
    return String(str || "").toLowerCase().match(/[a-z]+/g) || [];
  }

  function extractWordsAnyScript(str) {
    return String(str || "").match(/[\p{L}]+/gu) || [];
  }

  function buildWordGlossary(lang) {
    const active = normalizeLang(lang);
    if (WORD_GLOSSARY_CACHE[active]) return WORD_GLOSSARY_CACHE[active];

    const source = PHRASE_TRANSLATIONS[active] || {};
    const votes = {};

    Object.keys(source).forEach(function (enPhrase) {
      const translated = source[enPhrase];
      if (!translated || translated === enPhrase) return;

      const enWords = extractWordsAscii(enPhrase);
      const trWords = extractWordsAnyScript(translated).map(function (w) { return w.toLowerCase(); });

      // Conservative alignment: only use phrases with same token count to reduce wrong mappings.
      if (!enWords.length || enWords.length !== trWords.length || enWords.length > 12) return;

      for (let i = 0; i < enWords.length; i++) {
        const ew = enWords[i];
        const tw = trWords[i];
        if (!ew || !tw) continue;
        if (!votes[ew]) votes[ew] = {};
        votes[ew][tw] = (votes[ew][tw] || 0) + 1;
      }
    });

    const glossary = {};
    Object.keys(votes).forEach(function (ew) {
      const choices = votes[ew];
      let bestWord = "";
      let bestCount = -1;
      Object.keys(choices).forEach(function (tw) {
        if (choices[tw] > bestCount) {
          bestWord = tw;
          bestCount = choices[tw];
        }
      });
      if (bestWord) glossary[ew] = bestWord;
    });

    WORD_GLOSSARY_CACHE[active] = glossary;
    return glossary;
  }

  function preserveWordCase(source, translated) {
    if (!source || !translated) return translated;
    if (source === source.toUpperCase()) return translated.toUpperCase();
    if (source[0] === source[0].toUpperCase()) {
      return translated.charAt(0).toUpperCase() + translated.slice(1);
    }
    return translated;
  }

  function translateByGlossary(text, lang) {
    const active = normalizeLang(lang);
    if (active === "en" || active === "sasl") return text;

    const glossary = buildWordGlossary(active);
    if (!glossary || Object.keys(glossary).length === 0) return text;

    const masked = maskBrandTerms(text);
    const translated = String(masked.masked || "").replace(/[A-Za-z]+/g, function (word) {
      const mapped = glossary[word.toLowerCase()];
      if (!mapped) return word;
      return preserveWordCase(word, mapped);
    });
    return unmaskBrandTerms(translated, masked.tokenMap);
  }

  function getMtLanguageCode(lang) {
    const active = normalizeLang(lang);
    if (active === "sasl") return "en";
    return active;
  }

  function parseGoogleTranslateResponse(data) {
    if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
    return data[0].map(function (part) {
      return Array.isArray(part) ? (part[0] || "") : "";
    }).join("");
  }

  async function machineTranslateText(text, lang) {
    const active = normalizeLang(lang);
    if (!text || active === "en" || active === "sasl") return text;

    const langCode = getMtLanguageCode(active);
    const masked = maskBrandTerms(text);
    const cacheKey = masked.masked;

    if (!MT_CACHE[langCode]) MT_CACHE[langCode] = {};
    if (Object.prototype.hasOwnProperty.call(MT_CACHE[langCode], cacheKey)) {
      return unmaskBrandTerms(MT_CACHE[langCode][cacheKey], masked.tokenMap);
    }

    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t&tl=" +
      encodeURIComponent(langCode) + "&q=" + encodeURIComponent(cacheKey);

    try {
      const resp = await fetch(url);
      if (!resp.ok) return text;
      const data = await resp.json();
      const translated = parseGoogleTranslateResponse(data) || cacheKey;
      MT_CACHE[langCode][cacheKey] = translated;
      saveMtCache();
      return unmaskBrandTerms(translated, masked.tokenMap);
    } catch (_err) {
      return unmaskBrandTerms(cacheKey, masked.tokenMap);
    }
  }

  function collectUntranslatedNodes(active) {
    const nodes = [];
    const phraseTable = PHRASE_DICT[active] || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (!node) continue;
      const parentTag = node.parentElement ? node.parentElement.tagName : "";
      if (parentTag === "SCRIPT" || parentTag === "STYLE") continue;

      const raw = ORIGINAL_TEXT_NODES.get(node) || node.nodeValue || "";
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (Object.prototype.hasOwnProperty.call(phraseTable, trimmed) && phraseTable[trimmed] !== trimmed) continue;

      nodes.push({ node: node, raw: raw, trimmed: trimmed });
    }
    return nodes;
  }

  async function applyMachineTranslationFallback(lang, token) {
    const active = normalizeLang(lang);
    if (active === "en" || active === "sasl") return;

    const candidates = collectUntranslatedNodes(active);
    const uniqueTexts = [];
    const seen = new Set();

    candidates.forEach(function (entry) {
      if (!seen.has(entry.trimmed)) {
        seen.add(entry.trimmed);
        uniqueTexts.push(entry.trimmed);
      }
    });

    const map = {};
    const BATCH_SIZE = 12;
    for (let i = 0; i < uniqueTexts.length; i += BATCH_SIZE) {
      if (token !== mtApplyToken) return;
      const batch = uniqueTexts.slice(i, i + BATCH_SIZE);
      const translatedBatch = await Promise.all(batch.map(function (text) {
        return machineTranslateText(text, active);
      }));
      batch.forEach(function (text, index) {
        map[text] = translatedBatch[index];
      });
    }

    if (token !== mtApplyToken) return;

    candidates.forEach(function (entry) {
      const translated = map[entry.trimmed];
      if (!translated || translated === entry.trimmed) return;
      const start = entry.raw.indexOf(entry.trimmed);
      if (start > -1) {
        entry.node.nodeValue = sanitizeMojibakeText(entry.raw.slice(0, start) + translated + entry.raw.slice(start + entry.trimmed.length));
      }
    });

    const inputs = document.querySelectorAll("input[placeholder], textarea[placeholder]");
    for (const el of inputs) {
      const basePlaceholder = el.getAttribute("data-sp-i18n-base-placeholder") || el.getAttribute("placeholder") || "";
      if (!basePlaceholder) continue;
      const translated = await machineTranslateText(basePlaceholder, active);
      if (token !== mtApplyToken) return;
      if (translated) el.setAttribute("placeholder", sanitizeMojibakeText(translated));
    }
  }

  function translateTitle(lang) {
    const active = normalizeLang(lang);
    const titleTable = TITLE_TRANSLATIONS[active] || {};
    if (document.title && Object.prototype.hasOwnProperty.call(titleTable, document.title)) {
      document.title = sanitizeMojibakeText(titleTable[document.title]);
    }
  }

  function normalizeLang(code) {
    if (!code) return DEFAULT_LANG;
    const lower = String(code).toLowerCase();
    const base = lower.split("-")[0];
    if (SUPPORTED[lower]) return lower;
    if (SUPPORTED[base]) return base;
    return DEFAULT_LANG;
  }

  function detectInitialLanguage() {
    const stored = normalizeLang(localStorage.getItem(STORAGE_KEY));
    if (SUPPORTED[stored]) return stored;
    return normalizeLang(navigator.language || navigator.userLanguage || DEFAULT_LANG);
  }

  function getCurrentLanguage() {
    return normalizeLang(localStorage.getItem(STORAGE_KEY) || detectInitialLanguage());
  }

  function setCurrentLanguage(lang) {
    const normalized = normalizeLang(lang);
    localStorage.setItem(STORAGE_KEY, normalized);
    document.documentElement.setAttribute("lang", SUPPORTED[normalized].locale);
    applyTranslations(normalized);
    const event = new CustomEvent("sp:language-changed", { detail: { language: normalized } });
    window.dispatchEvent(event);
  }

  function t(key, fallback, lang) {
    const active = normalizeLang(lang || getCurrentLanguage());
    const table = DICT[active] || DICT.en;
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    const phraseTable = PHRASE_DICT[active] || {};
    if (Object.prototype.hasOwnProperty.call(phraseTable, key)) return phraseTable[key];
    if (Object.prototype.hasOwnProperty.call(DICT.en, key)) return DICT.en[key];
    const phraseEn = PHRASE_DICT.en || {};
    if (Object.prototype.hasOwnProperty.call(phraseEn, key)) return phraseEn[key];
    return fallback || key;
  }

  function replaceStaticPhrases(lang) {
    const phraseTable = PHRASE_DICT[lang];
    if (!phraseTable) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (!node || !node.nodeValue) continue;
      const parentTag = node.parentElement ? node.parentElement.tagName : "";
      if (parentTag === "SCRIPT" || parentTag === "STYLE") continue;
      if (!ORIGINAL_TEXT_NODES.has(node)) {
        ORIGINAL_TEXT_NODES.set(node, node.nodeValue);
      }
      const raw = ORIGINAL_TEXT_NODES.get(node) || node.nodeValue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (Object.prototype.hasOwnProperty.call(phraseTable, trimmed) && phraseTable[trimmed] !== trimmed) {
        const start = raw.indexOf(trimmed);
        if (start > -1) {
          node.nodeValue = sanitizeMojibakeText(raw.slice(0, start) + phraseTable[trimmed] + raw.slice(start + trimmed.length));
        }
      } else {
        node.nodeValue = sanitizeMojibakeText(translateByGlossary(raw, lang));
      }
    }

    const inputs = document.querySelectorAll("input[placeholder], textarea[placeholder]");
    inputs.forEach(function (el) {
      const basePlaceholder = el.getAttribute("data-sp-i18n-base-placeholder") || el.getAttribute("placeholder") || "";
      if (!el.hasAttribute("data-sp-i18n-base-placeholder")) {
        el.setAttribute("data-sp-i18n-base-placeholder", basePlaceholder);
      }
      if (basePlaceholder && Object.prototype.hasOwnProperty.call(phraseTable, basePlaceholder) && phraseTable[basePlaceholder] !== basePlaceholder) {
        el.setAttribute("placeholder", sanitizeMojibakeText(phraseTable[basePlaceholder]));
      } else {
        el.setAttribute("placeholder", sanitizeMojibakeText(translateByGlossary(basePlaceholder, lang)));
      }
    });
  }

  function applyDataKeyTranslations(lang) {
    const active = normalizeLang(lang);
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const fallback = el.getAttribute("data-i18n-fallback") || el.textContent;
      el.textContent = sanitizeMojibakeText(t(key, fallback, active));
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      const fallback = el.getAttribute("placeholder") || "";
      el.setAttribute("placeholder", sanitizeMojibakeText(t(key, fallback, active)));
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-title");
      if (!key) return;
      const fallback = el.getAttribute("title") || "";
      el.setAttribute("title", sanitizeMojibakeText(t(key, fallback, active)));
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-aria-label");
      if (!key) return;
      const fallback = el.getAttribute("aria-label") || "";
      el.setAttribute("aria-label", sanitizeMojibakeText(t(key, fallback, active)));
    });

    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-alt");
      if (!key) return;
      const fallback = el.getAttribute("alt") || "";
      el.setAttribute("alt", sanitizeMojibakeText(t(key, fallback, active)));
    });
  }

  function showSaslNotice(lang) {
    const existing = document.getElementById("spSaslNotice");
    if (lang !== "sasl") {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const notice = document.createElement("div");
    notice.id = "spSaslNotice";
    notice.style.position = "fixed";
    notice.style.left = "16px";
    notice.style.bottom = "16px";
    notice.style.maxWidth = "360px";
    notice.style.padding = "10px 12px";
    notice.style.borderRadius = "10px";
    notice.style.zIndex = "99999";
    notice.style.fontSize = "12px";
    notice.style.background = "rgba(15, 23, 42, 0.92)";
    notice.style.color = "#e2e8f0";
    notice.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
    notice.textContent = t("common.saslNotice", "SASL mode selected. Provide signed videos for key actions.", "sasl");
    document.body.appendChild(notice);
  }

  function applyTranslations(lang) {
    const active = normalizeLang(lang);
    const token = ++mtApplyToken;
    translateTitle(active);
    applyDataKeyTranslations(active);
    replaceStaticPhrases(active);
    showSaslNotice(active);

    const label = document.querySelector("#spLangSwitcher label");
    if (label) label.textContent = t("common.language", "Language", active);
    const select = document.getElementById("spLangSelect");
    if (select) select.setAttribute("aria-label", t("common.selectLanguage", "Select language", active));

    applyMachineTranslationFallback(active, token).catch(function () {
      // non-fatal, keep glossary/dictionary translations if MT fails
    });
  }

  function injectLanguageSwitcher() {
    if (document.getElementById("spLangSwitcher")) return;

    const wrap = document.createElement("div");
    wrap.id = "spLangSwitcher";
    wrap.style.position = "fixed";
    wrap.style.right = "16px";
    wrap.style.bottom = "16px";
    wrap.style.zIndex = "99999";
    wrap.style.background = "rgba(15, 23, 42, 0.92)";
    wrap.style.border = "1px solid rgba(148, 163, 184, 0.35)";
    wrap.style.borderRadius = "12px";
    wrap.style.padding = "8px 10px";
    wrap.style.backdropFilter = "blur(8px)";
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    const label = document.createElement("label");
    label.setAttribute("for", "spLangSelect");
    label.style.fontSize = "12px";
    label.style.fontWeight = "600";
    label.style.color = "#e2e8f0";
    label.textContent = "Language";

    const select = document.createElement("select");
    select.id = "spLangSelect";
    select.setAttribute("aria-label", "Select language");
    select.style.background = "#0f172a";
    select.style.color = "#e2e8f0";
    select.style.border = "1px solid rgba(148, 163, 184, 0.35)";
    select.style.borderRadius = "8px";
    select.style.padding = "6px 8px";
    select.style.fontSize = "12px";

    Object.keys(SUPPORTED).forEach(function (code) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = SUPPORTED[code].name;
      select.appendChild(option);
    });

    select.value = getCurrentLanguage();
    select.addEventListener("change", function () {
      setCurrentLanguage(select.value);
    });

    wrap.appendChild(label);
    wrap.appendChild(select);
    document.body.appendChild(wrap);
  }

  window.SP_I18N = {
    supported: SUPPORTED,
    t: t,
    getLanguage: getCurrentLanguage,
    setLanguage: setCurrentLanguage,
    apply: applyTranslations,
  };

  document.addEventListener("DOMContentLoaded", function () {
    injectLanguageSwitcher();
    const initial = getCurrentLanguage();
    document.documentElement.setAttribute("lang", SUPPORTED[initial].locale);
    applyTranslations(initial);
  });
})();
