import { LocalAIProvider } from "@/services/ai";

async function main() {
  const provider = new LocalAIProvider();
  const course = `
Chapitre 3 : Les suites numériques
Une suite arithmétique est une suite où chaque terme est obtenu en ajoutant un nombre constant r appelé raison.
Une suite géométrique est une suite où chaque terme est obtenu en multipliant par un nombre constant q appelé raison.
Le terme général d'une suite arithmétique est u_n = u_0 + n × r.
Le terme général d'une suite géométrique est u_n = u_0 × q^n.
Exemple : la suite des nombres pairs 2, 4, 6, 8 est arithmétique de raison 2.
Définition : la limite d'une suite est la valeur vers laquelle tendent ses termes.
`;
  let failed = 0;
  const sheet = await provider.generateStudySheet(course);
  console.log("StudySheet :", JSON.stringify({ summary: sheet.summary.slice(0, 60), definitions: sheet.definitions.length, chapters: sheet.chapters, concepts: sheet.concepts }, null, 1));
  if (sheet.definitions.length < 2) { console.log("✘ pas assez de définitions extraites"); failed += 1; }
  if (!sheet.chapters.some((c) => /suites/i.test(c))) { console.log("✘ chapitres absents"); failed += 1; }
  const cards = await provider.generateFlashcards(course, 6);
  console.log("Flashcards :", cards.length);
  cards.forEach((c) => console.log(`  Q: ${c.question.slice(0, 60)}`));
  if (cards.length < 3) { console.log("✘ pas assez de flashcards"); failed += 1; }
  if (cards.some((c) => /sujet de ce cours/i.test(c.question))) { console.log("✘ question générique présente"); failed += 1; }
  const quiz = await provider.generateQuiz(course, 4);
  console.log("Quiz :", quiz.length, "questions");
  quiz.forEach((q) => console.log(`  ${q.type}: ${q.question.slice(0, 70)}`));
  if (quiz.length < 3) { console.log("✘ pas assez de quiz"); failed += 1; }
  console.log(failed === 0 ? "AI LOCAL: SUCCÈS" : `${failed} échec(s)`);
  process.exit(failed === 0 ? 0 : 1);
}
void main();
