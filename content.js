// Pool de récompenses : citations réelles de votre chat, associées à une photo.
// category correspond à la catégorie d'objectif qui débloque ce type de récompense.
// "etudes" -> objectifs révisions | "sport" -> objectifs sport | "amour" -> objectifs social/autres

export const REWARDS = [
  // --- études / encouragement ---
  { category: "etudes", date: "18 janvier 2026", quote: "je me suis battue... j'ai essayé réellement et j'ai pas baissé les bras 1 seule fois devant une copie.", image: "pics_web/IMG_0223.jpg" },
  { category: "etudes", date: "18 janvier 2026", quote: "il se passe des choses folles dans ma tête, tout ce que je suis capable de faire pour concilier ma vie à 1000 à l'heure... quand on le met au profit de l'école, ça donne un truc pas mal.", image: "pics_web/IMG_0546.jpg" },
  { category: "etudes", date: "13 novembre 2025", quote: "pour l'examen en vrai déjà trop cool de s'entendre dire « je savais tout ».", image: "pics_web/IMG_0617.jpg" },
  { category: "etudes", date: "19 janvier 2026", quote: "cool que l'oral était facile et que t'es réussi comme tu voulais.", image: "pics_web/IMG_0657.jpg" },
  { category: "etudes", date: "18 janvier 2026", quote: "bon courage pour demain, quoi qu'il arrive je suis fier de toi vraiment.", image: "pics_web/IMG_0759.jpg" },
  { category: "etudes", date: "18 janvier 2026", quote: "je veux que quoi qu'il arrive tu sois fière.", image: "pics_web/IMG_0840.jpg" },
  { category: "etudes", date: "17 janvier 2026", quote: "loulou t'es en train de tout donner maintenant alors sois fière !!", image: "pics_web/IMG_1120.jpg" },
  { category: "etudes", date: "8 novembre 2025", quote: "sois plutôt fière de ta discipline loulou, t'es géniale vraiment. T'as mis la barre exactement là où tu voulais qu'elle soit et tu vas y arriver.", image: "pics_web/IMG_1170.jpg" },
  { category: "etudes", date: "25 novembre 2025", quote: "je vois nos progrès, je suis fière de ce que l'on devient et de voir que oui noé, ça va aller.", image: "pics_web/IMG_1250.jpg" },
  { category: "etudes", date: "3 février 2026", quote: "tu vas y arriver mon cœur.", image: "pics_web/IMG_1321.jpg" },
  { category: "etudes", date: "8 mai 2026", quote: "ne panique pas car je sais que tu peux le faire, alors prends une étape à la fois.", image: "pics_web/IMG_1344.jpg" },
  { category: "etudes", date: "1er septembre 2025", quote: "j'aimerais sensibiliser le grand public à la santé animale, pour de vrai, et aux conditions de travail des vétos... plus qu'à aller au bout.", image: "pics_web/IMG_1877.jpg" },
  { category: "etudes", date: "20 janvier 2026", quote: "j'ai moi-même très hâte de voir comment mon poulain a réussi ses examens.", image: "pics_web/IMG_2038.jpg" },
  { category: "etudes", date: "6 septembre 2025", quote: "je suis trop fier de toi.", image: "pics_web/IMG_2439.jpg" },
  { category: "etudes", date: "24 octobre 2025", quote: "l'article est vraiment chouette, je suis tellement fière de toi et de ce que tu deviens.", image: "pics_web/IMG_8779.jpg" },

  // --- sport ---
  { category: "sport", date: "27 février 2026", quote: "en vrai j'ai tellement progressé, le vélo y est pour beaucoup... y a un an j'aurais jamais fait un stage comme ça.", image: "pics_web/IMG_0513.jpg" },
  { category: "sport", date: "10 janvier 2026", quote: "magnifique parce que drafting autorisé + 750m de nat sur ce tri 😙", image: "pics_web/IMG_0593.jpg" },
  { category: "sport", date: "24 mars 2026", quote: "j'ai eu mon heure de gloire en 2024, c'était stylé, j'étais intelligente, les gens ont vu que je pouvais faire des études et du sport.", image: "pics_web/IMG_0665.jpg" },
  { category: "sport", date: "21 novembre 2025", quote: "j'ai hâte de te voir briller, je t'aime fort, quoi qu'il arrive.", image: "pics_web/IMG_0787.jpg" },
  { category: "sport", date: "4 avril 2026", quote: "vraiment trop fière de toi.", image: "pics_web/IMG_0904.jpg" },
  { category: "sport", date: "29 août 2025", quote: "bonne course mon amour, je suis de tout cœur avec toi.", image: "pics_web/IMG_1141.jpg" },
  { category: "sport", date: "13 juin 2026", quote: "la course était belle, j'étais fière de toi.", image: "pics_web/IMG_1242.jpg" },
  { category: "sport", date: "11 août 2026", quote: "je suis fier de toi, de moi, de nous.", image: "pics_web/IMG_1330.jpg" },

  // --- amour / tendresse (objectifs social / autres) ---
  { category: "amour", date: "13 août 2025", quote: "je t'ai déjà dit 1000x à quel point tu étais belle, intelligente, et que mon amour pour toi n'a aucun égal.", image: "pics_web/IMG_0648.jpg" },
  { category: "amour", date: "31 août 2025", quote: "c'est moi qui suis chanceuse, j'ai l'impression que tu répares tout ce qui est cassé en moi.", image: "pics_web/IMG_0677.jpg" },
  { category: "amour", date: "25 septembre 2025", quote: "je me sens tellement chanceuse de partager ta vie, tu crois toujours en moi et tu me traites avec tellement de patience et de douceur.", image: "pics_web/IMG_0811.jpg" },
  { category: "amour", date: "18 novembre 2025", quote: "bonjour madame... vous êtes sexy.", image: "pics_web/IMG_0908.jpg" },
  { category: "amour", date: "12 février 2026", quote: "tu me manques à l'autre bout du monde, et pourtant chaque jour qui passe j'ai hâte de te voir t'épanouir... joyeux anniversaire mon amour.", image: "pics_web/IMG_1184.jpg" },
  { category: "amour", date: "18 décembre 2025", quote: "je suis tellement chanceuse d'avoir à mes côtés un homme comme toi.", image: "pics_web/IMG_1283.jpg" },
  { category: "amour", date: "2 décembre 2025", quote: "s'il te plaît viens dans mon lit, tu me manques. — toi aussi tu me manques.", image: "pics_web/IMG_1333.jpg" },
  { category: "amour", date: "30 avril 2026", quote: "je t'aime fort et je veux pas être loin de toi longtemps.", image: "pics_web/IMG_1366.jpg" },
  { category: "amour", date: "chaque soir", quote: "bonne nuit mon cœur. bonne nuit mon loulou.", image: "pics_web/IMG_1892.jpg" },
  { category: "amour", date: "16 février 2026", quote: "je me sens tellement chanceux d'être entouré et aimé comme ça, merci mon cœur vraiment.", image: "pics_web/IMG_2489.jpg" },
  { category: "amour", date: "9 mai 2026", quote: "merci pour ces 9 mois... t'as été tellement forte et je suis trop fière de toi et de nous.", image: "pics_web/IMG_1332.jpg" },
  { category: "amour", date: "20 janvier 2026", quote: "je t'aime nono... ps : t'es le plus beau du monde.", image: "pics_web/IMG_1249.jpg" },
];
