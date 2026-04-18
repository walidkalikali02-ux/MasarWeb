const buildOffer = (lang, { key, brand, defaultUrl, category, emoji, pitchAr, pitchEn, ctaAr, ctaEn }) => {
  const envKey = `AFFILIATE_URL_${key}`;
  const url = process.env[envKey] || defaultUrl;
  const configured = Boolean(process.env[envKey]);

  return {
    key,
    brand,
    url,
    configured,
    category,
    emoji,
    pitch: lang === 'ar' ? pitchAr : pitchEn,
    cta: lang === 'ar' ? ctaAr : ctaEn
  };
};

const getAffiliateOffers = (lang = 'ar') => ([
  buildOffer(lang, {
    key: 'PROTON',
    brand: 'Proton',
    defaultUrl: 'https://proton.me/',
    category: lang === 'ar' ? 'خصوصية وبريد وVPN' : 'Privacy, mail, and VPN',
    emoji: '🛡️',
    pitchAr: 'حل مناسب لزوار الخصوصية الذين يبحثون عن VPN وخدمات بريد آمنة ضمن علامة واحدة.',
    pitchEn: 'A strong fit for privacy-focused visitors who want VPN and secure email under one brand.',
    ctaAr: 'اكتشف Proton',
    ctaEn: 'Explore Proton'
  }),
  buildOffer(lang, {
    key: 'SURFSHARK',
    brand: 'Surfshark',
    defaultUrl: 'https://surfshark.com/',
    category: lang === 'ar' ? 'VPN للمستخدمين العامين' : 'Consumer VPN',
    emoji: '🌊',
    pitchAr: 'مناسب للمقالات التي تتحدث عن الحجب الجغرافي، الخصوصية، واستخدام الشبكات العامة.',
    pitchEn: 'Best on pages about geo-blocking, privacy, and public Wi-Fi protection.',
    ctaAr: 'جرّب Surfshark',
    ctaEn: 'Try Surfshark'
  }),
  buildOffer(lang, {
    key: 'NORDVPN',
    brand: 'NordVPN',
    defaultUrl: 'https://nordvpn.com/',
    category: lang === 'ar' ? 'VPN شائع وعالي التحويل' : 'High-converting VPN',
    emoji: '🌐',
    pitchAr: 'عرض واضح للزوار الذين يبحثون عن بديل مدفوع أكثر ثباتاً من البروكسي المجاني.',
    pitchEn: 'A clear offer for users who need a paid, more durable alternative to a free proxy.',
    ctaAr: 'شاهد NordVPN',
    ctaEn: 'View NordVPN'
  }),
  buildOffer(lang, {
    key: 'ONEPASSWORD',
    brand: '1Password',
    defaultUrl: 'https://1password.com/',
    category: lang === 'ar' ? 'إدارة كلمات المرور' : 'Password management',
    emoji: '🔐',
    pitchAr: 'أفضل توافق مع أدوات كلمات المرور، الأسرار، الفرق، وصفحات الأمن الشخصي.',
    pitchEn: 'The best match for password, secrets, team access, and personal security pages.',
    ctaAr: 'اكتشف 1Password',
    ctaEn: 'Discover 1Password'
  }),
  buildOffer(lang, {
    key: 'DIGITALOCEAN',
    brand: 'DigitalOcean',
    defaultUrl: 'https://www.digitalocean.com/',
    category: lang === 'ar' ? 'استضافة وسحابة للمطورين' : 'Developer cloud hosting',
    emoji: '☁️',
    pitchAr: 'مناسب لمقالات إعداد البروكسي، السيرفرات، والبنية التحتية للمطورين والشركات الصغيرة.',
    pitchEn: 'A strong fit for proxy setup, server, and infrastructure content aimed at developers and small teams.',
    ctaAr: 'ابدأ مع DigitalOcean',
    ctaEn: 'Start with DigitalOcean'
  })
]);

module.exports = {
  getAffiliateOffers
};
