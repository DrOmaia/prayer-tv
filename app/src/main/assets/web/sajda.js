// The verses of prostration (the sign ۩ in the Mushaf) and what the reader is told about them.
// Fiqh follows the Shafi'i school, as everywhere in the app (an-Nawawi, Minhaj at-Talibin): the prostrations of
// recitation are fourteen, both of Surah Al-Hajj among them; the one in Surah Sad is a prostration of thanks
// (recommended outside the prayer, not done inside it).
// at: "surah:ayah" → 1 a prostration of recitation, 2 the prostration of thanks of Surah Sad.
window.SAJDA = {
  at: { '7:206': 1, '13:15': 1, '16:50': 1, '17:109': 1, '19:58': 1, '22:18': 1, '22:77': 1, '25:60': 1, '27:26': 1,
    '32:15': 1, '38:24': 2, '41:38': 1, '53:62': 1, '84:21': 1, '96:19': 1 },
  // what is said in the prostration, each with its source
  duas: [
    { x: 'سَجَدَ وَجْهِي لِلَّذِي خَلَقَهُ، وَشَقَّ سَمْعَهُ وَبَصَرَهُ، بِحَوْلِهِ وَقُوَّتِهِ',
      s: 'رواه أبو داود (1414) والترمذي (580) وقال: حسن صحيح، والنسائي (1129)',
      se: 'Abu Dawud (1414), at-Tirmidhi (580), who called it hasan sahih, and an-Nasa\'i (1129)' },
    { x: 'اللَّهُمَّ اكْتُبْ لِي بِهَا عِنْدَكَ أَجْرًا، وَضَعْ عَنِّي بِهَا وِزْرًا، وَاجْعَلْهَا لِي عِنْدَكَ ذُخْرًا، وَتَقَبَّلْهَا مِنِّي كَمَا تَقَبَّلْتَهَا مِنْ عَبْدِكَ دَاوُدَ',
      s: 'رواه الترمذي (579) وابن ماجه (1053)، وحسّن النووي إسناده',
      se: 'At-Tirmidhi (579) and Ibn Majah (1053); an-Nawawi called its chain hasan' }
  ],
  ar: {
    1: { t: 'سجدة تلاوة', x: 'يُسنّ السجود لمن قرأ هذه الآية ولمن استمع إلى قارئها. ويُشترط له ما يُشترط للصلاة: الطهارة واستقبال القبلة وستر العورة.' },
    2: { t: 'سجدة شكر', x: 'هذه سجدة شكر، وليست من سجدات التلاوة الأربع عشرة. يُستحب السجود عند قراءتها خارج الصلاة، ولا يُسجد لها في الصلاة.' },
    how: 'خارج الصلاة: تنوي وتكبّر تكبيرة الإحرام، ثم تكبّر وتسجد سجدة واحدة كسجود الصلاة، ثم ترفع مكبّرًا وتسلّم.',
    say: 'مما يُقال في السجود:',
    tip: 'من دعاء السجود:',
    ref: 'المرجع: منهاج الطالبين للنووي'
  },
  en: {
    1: { t: 'Prostration of recitation', x: 'Prostrating is sunnah for whoever recites this verse and for whoever listens to its reciter. It needs what the prayer needs: purity, facing the qiblah and covering the awrah.' },
    2: { t: 'Prostration of thanks', x: 'This is a prostration of thanks, not one of the fourteen prostrations of recitation. It is recommended on reciting it outside the prayer, and is not done inside the prayer.' },
    how: 'Outside the prayer: make the intention and say the opening takbir, then say the takbir and prostrate once as in the prayer, then rise with a takbir and give the salam.',
    say: 'Said in the prostration:',
    tip: 'From the supplication of the prostration:',
    ref: 'Reference: Minhaj at-Talibin by an-Nawawi'
  }
};
