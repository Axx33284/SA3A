// English, Arabic and Turkish strings. Arabic switches the whole layout to right-to-left.

const en = {
  appName: 'SA3A',
  nav: { prayer: 'Prayer times', calendar: 'Calendar', qibla: 'Qibla', alarms: 'Alarms', timers: 'Timers', stopwatch: 'Stopwatch', worldclock: 'World clock', settings: 'Settings' },
  prayers: { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha', jumuah: "Jumu'ah" },
  common: {
    today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', add: 'Add', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
    start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset', lap: 'Lap', dismiss: 'Dismiss', snooze: 'Snooze',
    stop: 'Stop', close: 'Close', on: 'On', off: 'Off', search: 'Search', name: 'Name', label: 'Label', days: 'Days', hours: 'Hours',
    minutes: 'Minutes', seconds: 'Seconds', dayShort: 'd', minShort: 'min', preview: 'Preview', restart: 'Restart', back: 'Back',
    loading: 'Loading…', offline: 'You are offline.', none: 'None', km: 'km', yes: 'Yes', no: 'No', in: 'in {t}', ago: '{t} ago',
  },
  prayer: {
    next: 'Next prayer', timeTo: '{prayer} in', now: 'It is {prayer} time', setLocation: 'Set your location',
    noLocation: 'Prayer times are calculated for your exact location. Set it once and SA3A does the rest, even offline.',
    detect: 'Detect my location', search: 'Search for a city or district', pickOnMap: 'Pick on the satellite map',
    modeSound: 'Azan on', modeNotify: 'Notification only', modeOff: 'Off', method: 'Method', changeLocation: 'Change location',
    iftarIn: 'Iftar in', suhoorEnds: 'Suhoor ends at {time}', ramadanDay: 'Ramadan · day {n}', imsak: 'Imsak',
    iftar: 'Iftar', reminder: '{prayer} in {n} minutes', timeFor: "It's time for {prayer}", azanPlaying: 'Azan is playing',
    stopAzan: 'Stop azan',
  },
  calendar: {
    title: 'Islamic calendar', upcoming: 'Upcoming', inDays: 'in {n} days', today: 'Today', tomorrow: 'Tomorrow',
    note: 'Dates follow the Umm al-Qura calendar. Where Ramadan and Eid begin with local moon sighting, they can differ by a day — adjust the Hijri date in Settings.',
    events: {
      newYear: 'Islamic New Year', ashura: 'Day of Ashura', mawlid: 'Mawlid an-Nabi', israMiraj: "Isra and Mi'raj",
      midShaban: "Mid-Sha'ban", ramadan: 'Ramadan begins', qadr: 'Laylat al-Qadr (27th night)', eidFitr: 'Eid al-Fitr',
      arafah: 'Day of Arafah', eidAdha: 'Eid al-Adha',
    },
  },
  qibla: {
    title: 'Qibla', bearing: '{deg}° from North', distance: '{km} km to the Kaaba',
    howTo: 'Face along the gold line. Line yourself up with a wall, street or building edge you can see on the satellite picture.',
    clickToSet: 'Click the map to put the pin exactly on your home, or drag the pin.', setHere: 'Set my location here',
    showRoute: 'Whole route', zoomHome: 'My location', offlineMap: 'The satellite picture needs internet. The direction above is still correct.',
    kaaba: 'The Kaaba, Makkah', cardinals: ['N', 'E', 'S', 'W'], you: 'You are here', trueNorth: 'Angles are measured from true north, clockwise.',
  },
  alarms: {
    title: 'Alarms', newAlarm: 'New alarm', editAlarm: 'Edit alarm', time: 'Time', date: 'Date (optional)', dateHint: 'Leave empty to use the repeat days',
    repeat: 'Repeat', once: 'Once', everyDay: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends', sound: 'Sound',
    snoozeLen: 'Snooze', noAlarms: 'No alarms yet', rings: 'Rings {t}', missed: 'Missed alarm', defaultLabel: 'Alarm',
    snoozed: 'Snoozed until {time}', awakeNote: 'Alarms ring while your PC is on or in the tray. Shut-down PCs cannot ring.',
  },
  sound: {
    tone: 'Chime', azan: 'Azan', file: 'Audio file on this PC', youtube: 'YouTube link', chooseFile: 'Choose file…',
    youtubeUrl: 'Paste a YouTube link', invalidYoutube: 'This is not a YouTube video link', noFile: 'No file chosen',
    voices: { makkah: 'Makkah – Sheikh Ali Ahmed Mulla', madinah: 'Madinah – Al-Masjid an-Nabawi', turkish: 'Turkish – Anuar Duman', alafasy: 'Mishary Alafasy', 'makkah-fajr': 'Makkah – Fajr azan' },
    fallback: 'The YouTube video could not play, so the built-in sound is used instead.',
  },
  timers: { title: 'Timers', newTimer: 'New timer', noTimers: 'No timers yet', ends: 'Ends {time}', done: "Time's up", defaultLabel: 'Timer', create: 'Start timer' },
  stopwatch: { title: 'Stopwatch', lap: 'Lap {n}', laps: 'Laps', lapTime: 'Lap time', total: 'Total' },
  worldclock: { title: 'World clock', addCity: 'Add city', local: 'Local time', ahead: '{n} h ahead', behind: '{n} h behind', same: 'Same time', searchTz: 'Search city or time zone' },
  settings: {
    title: 'Settings',
    general: 'Appearance', language: 'Language', theme: 'Theme', dark: 'Dark', light: 'Light', system: 'System', accent: 'Accent colour',
    animations: 'Smooth animations', animationsHint: 'Turn off for a calmer, instant interface.', timeFormat: 'Time format', h12: '12-hour', h24: '24-hour',
    startup: 'Startup', startAtLogin: 'Start with Windows', startAtLoginHint: 'SA3A starts quietly in the tray so azan and alarms never miss.',
    startHidden: 'Start minimised to tray', closeToTray: 'Keep running in the tray when closed',
    prayer: 'Prayer times', method: 'Calculation method', methodAuto: 'Automatic – {method}', madhab: 'Asr time', shafi: "Standard (Shafi'i, Maliki, Hanbali)",
    hanafi: 'Hanafi', highLat: 'High-latitude rule', hlAuto: 'Automatic', hlMiddle: 'Middle of the night', hlSeventh: 'Seventh of the night', hlAngle: 'Twilight angle',
    adjust: 'Adjust times (minutes)', adjustHint: 'Match your local mosque if it calls the azan a little earlier or later.',
    hijriOffset: 'Hijri date adjustment', hijriHint: 'Use when your country starts the month a day earlier or later.',
    azan: 'Azan', voice: 'Azan voice', fajrVoice: 'Fajr azan', length: 'Azan length', short: 'Short (opening only)', full: 'Full azan',
    volume: 'Volume', reminder: 'Reminder before prayer', reminderOff: 'No reminder', showOnAzan: 'Bring SA3A to the front at azan time',
    location: 'Location', current: 'Current location', notSet: 'Not set', change: 'Change',
    about: 'About', version: 'Version {v}', credits: 'Prayer times: adhan (MIT). Map: Leaflet, imagery © Esri, Maxar, Earthstar Geographics. Places: © OpenStreetMap contributors.',
    quit: 'Quit SA3A', sameAsVoice: 'Same as azan voice',
  },
  location: { title: 'Your location', searching: 'Searching…', noResults: 'No places found', detecting: 'Finding your location…', failed: 'Could not find your location. Search or pick it on the map instead.', coords: 'Coordinates' },
  tray: { open: 'Open SA3A', quit: 'Quit', next: '{prayer} at {time}' },
  weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const ar = {
  appName: 'ساعة',
  nav: { prayer: 'مواقيت الصلاة', calendar: 'التقويم', qibla: 'القبلة', alarms: 'المنبّهات', timers: 'المؤقّتات', stopwatch: 'ساعة الإيقاف', worldclock: 'الساعة العالمية', settings: 'الإعدادات' },
  prayers: { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء', jumuah: 'الجمعة' },
  common: {
    today: 'اليوم', tomorrow: 'غدًا', yesterday: 'أمس', add: 'إضافة', save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', edit: 'تعديل',
    start: 'ابدأ', pause: 'إيقاف مؤقت', resume: 'استئناف', reset: 'إعادة ضبط', lap: 'لفّة', dismiss: 'إيقاف', snooze: 'غفوة',
    stop: 'إيقاف', close: 'إغلاق', on: 'تشغيل', off: 'إيقاف', search: 'بحث', name: 'الاسم', label: 'التسمية', days: 'أيام', hours: 'ساعات',
    minutes: 'دقائق', seconds: 'ثوانٍ', dayShort: 'ي', minShort: 'د', preview: 'استماع', restart: 'إعادة', back: 'رجوع',
    loading: 'جارٍ التحميل…', offline: 'أنت غير متصل بالإنترنت.', none: 'لا شيء', km: 'كم', yes: 'نعم', no: 'لا', in: 'بعد {t}', ago: 'قبل {t}',
  },
  prayer: {
    next: 'الصلاة القادمة', timeTo: 'المتبقي على {prayer}', now: 'حان وقت {prayer}', setLocation: 'حدّد موقعك',
    noLocation: 'تُحسب مواقيت الصلاة لموقعك بدقة. حدّده مرة واحدة وسيتولّى ساعة الباقي، حتى دون إنترنت.',
    detect: 'تحديد موقعي تلقائيًا', search: 'ابحث عن مدينة أو حي', pickOnMap: 'اختر على صورة القمر الصناعي',
    modeSound: 'الأذان مفعّل', modeNotify: 'إشعار فقط', modeOff: 'إيقاف', method: 'طريقة الحساب', changeLocation: 'تغيير الموقع',
    iftarIn: 'المتبقي على الإفطار', suhoorEnds: 'ينتهي السحور الساعة {time}', ramadanDay: 'رمضان · اليوم {n}', imsak: 'الإمساك',
    iftar: 'الإفطار', reminder: '{prayer} بعد {n} دقائق', timeFor: 'حان الآن موعد صلاة {prayer}', azanPlaying: 'الأذان يُرفع الآن',
    stopAzan: 'إيقاف الأذان',
  },
  calendar: {
    title: 'التقويم الهجري', upcoming: 'المناسبات القادمة', inDays: 'بعد {n} يومًا', today: 'اليوم', tomorrow: 'غدًا',
    note: 'التواريخ وفق تقويم أم القرى. في البلدان التي تعتمد رؤية الهلال محليًا قد يختلف بدء رمضان والعيد يومًا واحدًا — عدّل التاريخ الهجري من الإعدادات.',
    events: {
      newYear: 'رأس السنة الهجرية', ashura: 'يوم عاشوراء', mawlid: 'المولد النبوي', israMiraj: 'الإسراء والمعراج',
      midShaban: 'ليلة النصف من شعبان', ramadan: 'بداية شهر رمضان', qadr: 'ليلة القدر (ليلة 27)', eidFitr: 'عيد الفطر',
      arafah: 'يوم عرفة', eidAdha: 'عيد الأضحى',
    },
  },
  qibla: {
    title: 'القبلة', bearing: '{deg}° من الشمال', distance: '{km} كم إلى الكعبة',
    howTo: 'اتّجه على امتداد الخط الذهبي. استعن بجدار أو شارع أو حافة مبنى تراها في صورة القمر الصناعي لتضبط اتجاهك.',
    clickToSet: 'انقر على الخريطة لوضع الدبوس على منزلك بالضبط، أو اسحب الدبوس.', setHere: 'اجعل هذا موقعي',
    showRoute: 'المسار كاملًا', zoomHome: 'موقعي', offlineMap: 'صورة القمر الصناعي تحتاج إلى إنترنت. الاتجاه المعروض أعلاه صحيح.',
    kaaba: 'الكعبة المشرفة، مكة المكرمة', cardinals: ['ش', 'ق', 'ج', 'غ'], you: 'أنت هنا', trueNorth: 'الزوايا مقيسة من الشمال الجغرافي باتجاه عقارب الساعة.',
  },
  alarms: {
    title: 'المنبّهات', newAlarm: 'منبّه جديد', editAlarm: 'تعديل المنبّه', time: 'الوقت', date: 'التاريخ (اختياري)', dateHint: 'اتركه فارغًا لاستخدام أيام التكرار',
    repeat: 'التكرار', once: 'مرة واحدة', everyDay: 'كل يوم', weekdays: 'أيام العمل', weekends: 'عطلة نهاية الأسبوع', sound: 'الصوت',
    snoozeLen: 'الغفوة', noAlarms: 'لا توجد منبّهات بعد', rings: 'يرنّ {t}', missed: 'منبّه فائت', defaultLabel: 'منبّه',
    snoozed: 'مؤجَّل حتى {time}', awakeNote: 'ترنّ المنبّهات ما دام الحاسوب يعمل أو البرنامج في شريط المهام. لا يمكن الرنين والحاسوب مطفأ.',
  },
  sound: {
    tone: 'نغمة', azan: 'أذان', file: 'ملف صوتي من الحاسوب', youtube: 'رابط يوتيوب', chooseFile: 'اختر ملفًا…',
    youtubeUrl: 'الصق رابط يوتيوب', invalidYoutube: 'هذا ليس رابط فيديو على يوتيوب', noFile: 'لم يُختر ملف',
    voices: { makkah: 'مكة – الشيخ علي أحمد ملا', madinah: 'المدينة – المسجد النبوي', turkish: 'تركي – أنور دومان', alafasy: 'مشاري العفاسي', 'makkah-fajr': 'مكة – أذان الفجر' },
    fallback: 'تعذّر تشغيل فيديو يوتيوب، فاستُخدم الصوت المدمج بدلًا منه.',
  },
  timers: { title: 'المؤقّتات', newTimer: 'مؤقّت جديد', noTimers: 'لا توجد مؤقّتات بعد', ends: 'ينتهي {time}', done: 'انتهى الوقت', defaultLabel: 'مؤقّت', create: 'تشغيل المؤقّت' },
  stopwatch: { title: 'ساعة الإيقاف', lap: 'لفّة {n}', laps: 'اللفّات', lapTime: 'زمن اللفّة', total: 'الإجمالي' },
  worldclock: { title: 'الساعة العالمية', addCity: 'إضافة مدينة', local: 'الوقت المحلي', ahead: 'متقدّم {n} س', behind: 'متأخّر {n} س', same: 'نفس الوقت', searchTz: 'ابحث عن مدينة أو منطقة زمنية' },
  settings: {
    title: 'الإعدادات',
    general: 'المظهر', language: 'اللغة', theme: 'السمة', dark: 'داكن', light: 'فاتح', system: 'حسب النظام', accent: 'اللون الرئيسي',
    animations: 'حركات انتقال سلسة', animationsHint: 'أوقفها لواجهة أهدأ وفورية.', timeFormat: 'تنسيق الوقت', h12: '12 ساعة', h24: '24 ساعة',
    startup: 'بدء التشغيل', startAtLogin: 'التشغيل مع ويندوز', startAtLoginHint: 'يعمل ساعة بهدوء في شريط المهام حتى لا يفوتك أذان أو منبّه.',
    startHidden: 'البدء مصغّرًا في شريط المهام', closeToTray: 'الاستمرار في العمل عند الإغلاق',
    prayer: 'مواقيت الصلاة', method: 'طريقة الحساب', methodAuto: 'تلقائي – {method}', madhab: 'وقت العصر', shafi: 'الجمهور (الشافعي والمالكي والحنبلي)',
    hanafi: 'الحنفي', highLat: 'قاعدة خطوط العرض العليا', hlAuto: 'تلقائي', hlMiddle: 'منتصف الليل', hlSeventh: 'سُبع الليل', hlAngle: 'زاوية الشفق',
    adjust: 'تعديل المواقيت (بالدقائق)', adjustHint: 'طابِق مسجدك المحلي إن كان يؤذّن قبل الموعد أو بعده بقليل.',
    hijriOffset: 'تعديل التاريخ الهجري', hijriHint: 'استخدمه إذا بدأ الشهر في بلدك قبل يوم أو بعده.',
    azan: 'الأذان', voice: 'صوت الأذان', fajrVoice: 'أذان الفجر', length: 'مدة الأذان', short: 'قصير (المطلع فقط)', full: 'الأذان كاملًا',
    volume: 'مستوى الصوت', reminder: 'تذكير قبل الصلاة', reminderOff: 'دون تذكير', showOnAzan: 'إظهار ساعة عند الأذان',
    location: 'الموقع', current: 'الموقع الحالي', notSet: 'غير محدّد', change: 'تغيير',
    about: 'حول', version: 'الإصدار {v}', credits: 'المواقيت: مكتبة adhan (MIT). الخريطة: Leaflet، الصور © Esri وMaxar وEarthstar Geographics. الأماكن: © مساهمو OpenStreetMap.',
    quit: 'إنهاء ساعة', sameAsVoice: 'نفس صوت الأذان',
  },
  location: { title: 'موقعك', searching: 'جارٍ البحث…', noResults: 'لم يُعثر على أماكن', detecting: 'جارٍ تحديد موقعك…', failed: 'تعذّر تحديد موقعك. ابحث عنه أو اختره على الخريطة.', coords: 'الإحداثيات' },
  tray: { open: 'فتح ساعة', quit: 'إنهاء', next: '{prayer} الساعة {time}' },
  weekdays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  weekdaysShort: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'],
};

const tr = {
  appName: 'SA3A',
  nav: { prayer: 'Namaz vakitleri', calendar: 'Takvim', qibla: 'Kıble', alarms: 'Alarmlar', timers: 'Zamanlayıcılar', stopwatch: 'Kronometre', worldclock: 'Dünya saati', settings: 'Ayarlar' },
  prayers: { fajr: 'İmsak', sunrise: 'Güneş', dhuhr: 'Öğle', asr: 'İkindi', maghrib: 'Akşam', isha: 'Yatsı', jumuah: 'Cuma' },
  common: {
    today: 'Bugün', tomorrow: 'Yarın', yesterday: 'Dün', add: 'Ekle', save: 'Kaydet', cancel: 'İptal', delete: 'Sil', edit: 'Düzenle',
    start: 'Başlat', pause: 'Duraklat', resume: 'Devam et', reset: 'Sıfırla', lap: 'Tur', dismiss: 'Kapat', snooze: 'Ertele',
    stop: 'Durdur', close: 'Kapat', on: 'Açık', off: 'Kapalı', search: 'Ara', name: 'Ad', label: 'Etiket', days: 'Gün', hours: 'Saat',
    minutes: 'Dakika', seconds: 'Saniye', dayShort: 'g', minShort: 'dk', preview: 'Dinle', restart: 'Yeniden başlat', back: 'Geri',
    loading: 'Yükleniyor…', offline: 'İnternet bağlantısı yok.', none: 'Yok', km: 'km', yes: 'Evet', no: 'Hayır', in: '{t} sonra', ago: '{t} önce',
  },
  prayer: {
    next: 'Sıradaki vakit', timeTo: '{prayer} vaktine kalan', now: '{prayer} vakti girdi', setLocation: 'Konumunuzu belirleyin',
    noLocation: 'Namaz vakitleri tam konumunuza göre hesaplanır. Bir kez ayarlayın, gerisini SA3A halleder; internet olmasa bile.',
    detect: 'Konumumu bul', search: 'Şehir veya ilçe arayın', pickOnMap: 'Uydu haritasından seçin',
    modeSound: 'Ezan açık', modeNotify: 'Yalnızca bildirim', modeOff: 'Kapalı', method: 'Hesaplama yöntemi', changeLocation: 'Konumu değiştir',
    iftarIn: 'İftara kalan', suhoorEnds: 'Sahur {time} saatinde biter', ramadanDay: 'Ramazan · {n}. gün', imsak: 'İmsak',
    iftar: 'İftar', reminder: '{prayer} vaktine {n} dakika kaldı', timeFor: '{prayer} vakti girdi', azanPlaying: 'Ezan okunuyor',
    stopAzan: 'Ezanı durdur',
  },
  calendar: {
    title: 'Hicri takvim', upcoming: 'Yaklaşan günler', inDays: '{n} gün sonra', today: 'Bugün', tomorrow: 'Yarın',
    note: 'Tarihler Ümmü’l-Kurâ takvimine göredir. Ramazan ve bayramın yerel hilal gözlemiyle başladığı ülkelerde bir gün fark olabilir; Hicri tarihi Ayarlar’dan düzeltebilirsiniz.',
    events: {
      newYear: 'Hicri Yılbaşı', ashura: 'Aşure Günü', mawlid: 'Mevlid Kandili', israMiraj: 'Miraç Kandili',
      midShaban: 'Berat Kandili', ramadan: 'Ramazan başlangıcı', qadr: 'Kadir Gecesi', eidFitr: 'Ramazan Bayramı',
      arafah: 'Arefe Günü', eidAdha: 'Kurban Bayramı',
    },
  },
  qibla: {
    title: 'Kıble', bearing: 'Kuzeyden {deg}°', distance: 'Kâbe’ye {km} km',
    howTo: 'Altın çizgi boyunca yönelin. Uydu görüntüsünde gördüğünüz bir duvar, sokak veya bina kenarıyla hizalanın.',
    clickToSet: 'İğneyi tam evinizin üzerine koymak için haritaya tıklayın ya da iğneyi sürükleyin.', setHere: 'Konumum burası',
    showRoute: 'Tüm rota', zoomHome: 'Konumum', offlineMap: 'Uydu görüntüsü için internet gerekir. Yukarıdaki yön yine de doğrudur.',
    kaaba: 'Kâbe, Mekke', cardinals: ['K', 'D', 'G', 'B'], you: 'Buradasınız', trueNorth: 'Açılar coğrafi kuzeyden saat yönünde ölçülür.',
  },
  alarms: {
    title: 'Alarmlar', newAlarm: 'Yeni alarm', editAlarm: 'Alarmı düzenle', time: 'Saat', date: 'Tarih (isteğe bağlı)', dateHint: 'Tekrar günlerini kullanmak için boş bırakın',
    repeat: 'Tekrar', once: 'Bir kez', everyDay: 'Her gün', weekdays: 'Hafta içi', weekends: 'Hafta sonu', sound: 'Ses',
    snoozeLen: 'Erteleme', noAlarms: 'Henüz alarm yok', rings: '{t} çalar', missed: 'Kaçırılan alarm', defaultLabel: 'Alarm',
    snoozed: '{time} saatine ertelendi', awakeNote: 'Alarmlar bilgisayar açıkken veya uygulama sistem tepsisindeyken çalar. Kapalı bilgisayar çalamaz.',
  },
  sound: {
    tone: 'Zil sesi', azan: 'Ezan', file: 'Bilgisayardaki ses dosyası', youtube: 'YouTube bağlantısı', chooseFile: 'Dosya seç…',
    youtubeUrl: 'YouTube bağlantısını yapıştırın', invalidYoutube: 'Bu bir YouTube video bağlantısı değil', noFile: 'Dosya seçilmedi',
    voices: { makkah: 'Mekke – Şeyh Ali Ahmed Molla', madinah: 'Medine – Mescid-i Nebevî', turkish: 'Türk ezanı – Anuar Duman', alafasy: 'Mişari Alafasi', 'makkah-fajr': 'Mekke – Sabah ezanı' },
    fallback: 'YouTube videosu oynatılamadı; bunun yerine yerleşik ses çalındı.',
  },
  timers: { title: 'Zamanlayıcılar', newTimer: 'Yeni zamanlayıcı', noTimers: 'Henüz zamanlayıcı yok', ends: 'Bitiş: {time}', done: 'Süre doldu', defaultLabel: 'Zamanlayıcı', create: 'Zamanlayıcıyı başlat' },
  stopwatch: { title: 'Kronometre', lap: '{n}. tur', laps: 'Turlar', lapTime: 'Tur süresi', total: 'Toplam' },
  worldclock: { title: 'Dünya saati', addCity: 'Şehir ekle', local: 'Yerel saat', ahead: '{n} sa ileride', behind: '{n} sa geride', same: 'Aynı saat', searchTz: 'Şehir veya saat dilimi arayın' },
  settings: {
    title: 'Ayarlar',
    general: 'Görünüm', language: 'Dil', theme: 'Tema', dark: 'Koyu', light: 'Açık', system: 'Sistem', accent: 'Vurgu rengi',
    animations: 'Yumuşak geçişler', animationsHint: 'Daha sakin ve anında tepki veren bir arayüz için kapatın.', timeFormat: 'Saat biçimi', h12: '12 saat', h24: '24 saat',
    startup: 'Başlangıç', startAtLogin: 'Windows ile başlat', startAtLoginHint: 'SA3A sistem tepsisinde sessizce başlar; hiçbir ezanı ve alarmı kaçırmazsınız.',
    startHidden: 'Sistem tepsisinde küçültülmüş başlat', closeToTray: 'Kapatınca sistem tepsisinde çalışmaya devam et',
    prayer: 'Namaz vakitleri', method: 'Hesaplama yöntemi', methodAuto: 'Otomatik – {method}', madhab: 'İkindi vakti', shafi: 'Standart (Şafii, Maliki, Hanbeli)',
    hanafi: 'Hanefi (asr-ı sani)', highLat: 'Yüksek enlem kuralı', hlAuto: 'Otomatik', hlMiddle: 'Gecenin yarısı', hlSeventh: 'Gecenin yedide biri', hlAngle: 'Şafak açısı',
    adjust: 'Vakit düzeltme (dakika)', adjustHint: 'Mahallenizdeki cami ezanı biraz erken veya geç okuyorsa eşitleyin.',
    hijriOffset: 'Hicri tarih düzeltmesi', hijriHint: 'Ülkenizde ay bir gün önce veya sonra başlıyorsa kullanın.',
    azan: 'Ezan', voice: 'Ezan sesi', fajrVoice: 'Sabah ezanı', length: 'Ezan süresi', short: 'Kısa (yalnızca başlangıç)', full: 'Tam ezan',
    volume: 'Ses düzeyi', reminder: 'Vakitten önce hatırlat', reminderOff: 'Hatırlatma yok', showOnAzan: 'Ezan vaktinde SA3A’yı öne getir',
    location: 'Konum', current: 'Geçerli konum', notSet: 'Ayarlanmadı', change: 'Değiştir',
    about: 'Hakkında', version: 'Sürüm {v}', credits: 'Vakitler: adhan (MIT). Harita: Leaflet, görüntüler © Esri, Maxar, Earthstar Geographics. Yerler: © OpenStreetMap katkıcıları.',
    quit: 'SA3A’dan çık', sameAsVoice: 'Ezan sesiyle aynı',
  },
  location: { title: 'Konumunuz', searching: 'Aranıyor…', noResults: 'Yer bulunamadı', detecting: 'Konumunuz bulunuyor…', failed: 'Konumunuz bulunamadı. Arayın veya haritadan seçin.', coords: 'Koordinatlar' },
  tray: { open: 'SA3A’yı aç', quit: 'Çık', next: '{prayer} {time}' },
  weekdays: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  weekdaysShort: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
};

export const LANGS = { en, ar, tr };
export const LANG_NAMES = { en: 'English', ar: 'العربية', tr: 'Türkçe' };
let current = en;
let currentCode = 'en';

export function detectLang() {
  const l = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS[l] ? l : 'en';
}

export function setLang(code) {
  currentCode = LANGS[code] ? code : 'en';
  current = LANGS[currentCode];
  document.documentElement.lang = currentCode;
  document.documentElement.dir = currentCode === 'ar' ? 'rtl' : 'ltr';
}

export const lang = () => currentCode;

/** t('prayer.timeTo', { prayer: 'Asr' }) – falls back to English, then to the key itself. */
export function t(key, vars) {
  const get = (obj) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  let s = get(current);
  if (s === undefined) s = get(en);
  if (s === undefined) return key;
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
