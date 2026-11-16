// Η έρευνα πίσω από τους κανόνες και τις συμβουλές της αξιολόγησης.
// Κάθε εγγραφή: τι παίρνει η εφαρμογή από την πηγή (say), η πηγή (cite) και ο σύνδεσμός της (url).
// Μπαίνουν μόνο θέσεις επιστημονικών φορέων, μετα-αναλύσεις/ανασκοπήσεις και κλινικές μελέτες που έχουν ελεγχθεί.
// Όταν αλλάζει ένας κανόνας ή προστίθεται συμβουλή, η πηγή της προστίθεται εδώ· αν δεν υπάρχει καλή πηγή, η συμβουλή
// γράφεται ως πρακτικός κανόνας και μετράει λίγο ή καθόλου στον βαθμό.
import { T } from './lang.js';

// goals: σε ποιον στόχο αφορά κυρίως ('bulk' | 'cut' | 'maintain')· χωρίς goals = όλοι
export const EVIDENCE = [
  { group: T('Training', 'Προπόνηση'), items: [
    { say: T('More weekly sets build more muscle; 10 or more sets per muscle a week gave the largest gains.', 'Περισσότερα σετ την εβδομάδα χτίζουν περισσότερους μύες· τα 10 ή περισσότερα σετ ανά μυ έδωσαν τη μεγαλύτερη ανάπτυξη.'),
      cite: 'Schoenfeld, Ogborn & Krieger, J Sports Sci 2017', url: 'https://pubmed.ncbi.nlm.nih.gov/27433992/' },
    { say: T('Training a muscle more often gave more growth; the authors advise at least twice a week.', 'Η συχνότερη προπόνηση ενός μυός έδωσε περισσότερη ανάπτυξη· οι συγγραφείς προτείνουν τουλάχιστον 2 φορές την εβδομάδα.'),
      cite: 'Schoenfeld, Ogborn & Krieger, Sports Med 2016', url: 'https://pubmed.ncbi.nlm.nih.gov/27102172/' },
    { say: T('Sets do not have to reach failure: training to failure built no more muscle than stopping short of it.', 'Τα σετ δεν χρειάζεται να φτάνουν στην αποτυχία: η προπόνηση μέχρι αποτυχίας δεν έχτισε περισσότερους μύες από το να σταματάς λίγο πριν.'),
      cite: 'Refalo et al., Sports Med 2023', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9935748' },
    { say: T('Training regularly matters more than any single variable of the program.', 'Η τακτική προπόνηση μετράει περισσότερο από οποιαδήποτε επιμέρους μεταβλητή του προγράμματος.'),
      cite: T('American College of Sports Medicine, position stand on resistance training, 2026', 'American College of Sports Medicine, θέση για την προπόνηση με αντίσταση, 2026'), url: 'https://acsm.org/resistance-training-guidelines-update-2026/' },
  ] },
  { group: T('Muscle gain', 'Μυϊκή ανάπτυξη'), goals: ['bulk'], items: [
    { say: T('Protein above about 1.6 g per kg of body weight a day adds no further muscle for most people.', 'Πρωτεΐνη πάνω από περίπου 1,6 g ανά κιλό σωματικού βάρους την ημέρα δεν προσθέτει άλλους μύες στους περισσότερους.'),
      cite: 'Morton et al., Br J Sports Med 2018', url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/' },
    { say: T('A small calorie surplus (about 10–20% above maintenance) and a slow weight gain keep fat gain down.', 'Ένα μικρό θερμιδικό πλεόνασμα (περίπου 10–20% πάνω από τη συντήρηση) και αργή αύξηση βάρους κρατούν χαμηλά το λίπος που παίρνεις.'),
      cite: 'Iraki, Fitschen, Espinar & Helms, Sports 2019', url: 'https://www.mdpi.com/2075-4663/7/7/154' },
    { say: T('People who already train can gain muscle while losing fat, with high protein and progressive training.', 'Και όσοι ήδη προπονούνται μπορούν να χτίσουν μύες χάνοντας λίπος, με αρκετή πρωτεΐνη και προοδευτική προπόνηση.'),
      cite: 'Barakat et al., Strength Cond J 2020', url: 'https://doi.org/10.1519/SSC.0000000000000584' },
  ] },
  { group: T('Fat loss', 'Απώλεια λίπους'), goals: ['cut'], items: [
    { say: T('Losing 0.5–1% of body weight a week, with high protein, keeps the most muscle.', 'Απώλεια 0,5–1% του βάρους την εβδομάδα, με αρκετή πρωτεΐνη, κρατά τους περισσότερους μύες.'),
      cite: 'Helms, Aragon & Fitschen, J Int Soc Sports Nutr 2014', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492' },
    { say: T('In diet studies, programs with 10 or more weekly sets per muscle lost little or no lean mass. The evidence is still limited.', 'Στις μελέτες με δίαιτα, τα προγράμματα με 10 ή περισσότερα εβδομαδιαία σετ ανά μυ έχασαν ελάχιστη ή καθόλου άλιπη μάζα. Τα δεδομένα είναι ακόμα λίγα.'),
      cite: 'Roth, Schoenfeld & Behringer, Eur J Appl Physiol 2022', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9012799' },
    { say: T('Adults should get 150–300 minutes of moderate activity a week.', 'Οι ενήλικες χρειάζονται 150–300 λεπτά μέτριας δραστηριότητας την εβδομάδα.'),
      cite: T('World Health Organization guidelines, Br J Sports Med 2020', 'Οδηγίες Παγκόσμιου Οργανισμού Υγείας, Br J Sports Med 2020'), url: 'https://bjsm.bmj.com/content/54/24/1451' },
  ] },
  { group: T('Maintenance', 'Διατήρηση'), goals: ['maintain'], items: [
    { say: T('Young adults kept their muscle for 32 weeks on a third or less of their training, as long as the loads stayed the same; older adults needed more.', 'Νέοι ενήλικες κράτησαν τους μύες τους για 32 εβδομάδες με το ένα τρίτο ή λιγότερο της προπόνησής τους, εφόσον τα φορτία έμειναν ίδια· οι μεγαλύτεροι χρειάστηκαν περισσότερη.'),
      cite: 'Bickel, Cross & Bamman, Med Sci Sports Exerc 2011', url: 'https://pubmed.ncbi.nlm.nih.gov/21131862/' },
    { say: T('Intensity is the key to maintaining: muscle and strength hold on little training when the loads stay heavy.', 'Η ένταση είναι το κλειδί της διατήρησης: μύες και δύναμη κρατιούνται με λίγη προπόνηση όταν τα φορτία μένουν βαριά.'),
      cite: 'Spiering, Mujika, Sharp & Foulis, J Strength Cond Res 2021', url: 'https://pubmed.ncbi.nlm.nih.gov/33629972/' },
  ] },
  { group: T('Bones', 'Οστά'), items: [
    { say: T('For bone health, adults need resistance exercise 2–3 times a week and weight-bearing activity, at moderate to high bone-loading intensity.', 'Για την υγεία των οστών οι ενήλικες χρειάζονται ασκήσεις με αντίσταση 2–3 φορές την εβδομάδα και δραστηριότητες με φόρτιση του σώματος, μέτριας έως υψηλής έντασης για τα οστά.'),
      cite: T('American College of Sports Medicine, position stand on physical activity and bone health, 2004', 'American College of Sports Medicine, θέση για τη φυσική δραστηριότητα και την υγεία των οστών, 2004'), url: 'https://doi.org/10.1249/01.mss.0000142662.21767.58' },
    { say: T('Heavy lifting twice a week for 8 months raised spine bone density by about 3% in women with low bone mass.', 'Βαριά προπόνηση 2 φορές την εβδομάδα για 8 μήνες αύξησε την οστική πυκνότητα της σπονδυλικής στήλης κατά περίπου 3% σε γυναίκες με χαμηλή οστική μάζα.'),
      cite: 'Watson et al. (LIFTMOR), J Bone Miner Res 2018', url: 'https://pubmed.ncbi.nlm.nih.gov/28975661/' },
    { say: T('Losing weight by dieting lowers hip bone density a little.', 'Η απώλεια βάρους με δίαιτα μειώνει λίγο την οστική πυκνότητα στο ισχίο.'),
      cite: 'Zibellini et al., J Bone Miner Res 2015', url: 'https://doi.org/10.1002/jbmr.2564' },
    { say: T('In dieting older adults, exercise cut the loss of hip bone density by more than half.', 'Σε μεγαλύτερους ενήλικες σε δίαιτα, η άσκηση μείωσε την απώλεια οστικής πυκνότητας στο ισχίο περισσότερο από το μισό.'),
      cite: 'Shah et al., J Bone Miner Res 2011', url: 'https://pubmed.ncbi.nlm.nih.gov/21786319/' },
    { say: T('Adults need about 1,000–1,200 mg of calcium and 15–20 µg (600–800 IU) of vitamin D a day.', 'Οι ενήλικες χρειάζονται περίπου 1.000–1.200 mg ασβέστιο και 15–20 µg (600–800 IU) βιταμίνη D την ημέρα.'),
      cite: T('Institute of Medicine, dietary reference intakes for calcium and vitamin D, 2011', 'Institute of Medicine, συνιστώμενες προσλήψεις ασβεστίου και βιταμίνης D, 2011'), url: 'https://pubmed.ncbi.nlm.nih.gov/21118827/' },
    { say: T('A bone density scan (DXA) is recommended for women from 65, and earlier after menopause with risk factors.', 'Η μέτρηση οστικής πυκνότητας (DXA) συνιστάται για τις γυναίκες από τα 65, και νωρίτερα μετά την εμμηνόπαυση όταν υπάρχουν παράγοντες κινδύνου.'),
      cite: T('US Preventive Services Task Force, 2025', 'US Preventive Services Task Force, 2025'), url: 'https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/osteoporosis-screening' },
  ] },
  { group: T('Body measurements', 'Μετρήσεις σώματος'), items: [
    { say: T('Waist-to-height ratio flags cardiometabolic risk better than BMI or waist size alone; the app uses the common limit of 0.5.', 'Ο λόγος μέσης προς ύψος δείχνει τον καρδιομεταβολικό κίνδυνο καλύτερα από τον BMI ή τη μέση μόνη της· η εφαρμογή χρησιμοποιεί το συνηθισμένο όριο 0,5.'),
      cite: 'Ashwell, Gunn & Gibson, Obes Rev 2012', url: 'https://pubmed.ncbi.nlm.nih.gov/22106927/' },
    { say: T('Healthy body-fat ranges that match a healthy BMI; the app uses the range for adults aged 20–39.', 'Υγιή εύρη ποσοστού λίπους που αντιστοιχούν σε υγιή BMI· η εφαρμογή χρησιμοποιεί το εύρος για ενήλικες 20–39 ετών.'),
      cite: 'Gallagher et al., Am J Clin Nutr 2000', url: 'https://pubmed.ncbi.nlm.nih.gov/10966886/' },
  ] },
];

// οι ομάδες με σειρά για τον στόχο του χρήστη: πρώτα η δική του, οι άλλοι δύο στόχοι στο τέλος
export function evidenceFor(goalType = 'bulk') {
  const mine = (g) => !g.goals || g.goals.includes(goalType);
  return [...EVIDENCE.filter((g) => g.goals && mine(g)), ...EVIDENCE.filter((g) => !g.goals), ...EVIDENCE.filter((g) => !mine(g))];
}
