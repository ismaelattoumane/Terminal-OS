export type StudySheetContent = { summary: string; keyIdeas: string[]; definitions: string[]; formulas: string[]; methods: string[]; commonMistakes: string[]; examples: string[]; takeaways: string[] };

export interface AIProvider {
  generateStudySheet(text: string): Promise<StudySheetContent>;
  generateFlashcards(text: string, count?: number): Promise<Array<{ question: string; answer: string }>>;
  generateQuiz(text: string, count?: number): Promise<Array<{ question: string; answer: string; choices: string[]; type: "short_answer" }>>;
}

export class LocalAIProvider implements AIProvider {
  async generateStudySheet(text: string) {
    const sentences = text.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean);
    const summary = sentences.slice(0, 3).join(". ").slice(0, 800);
    return { summary, keyIdeas: sentences.slice(0, 8), definitions: [], formulas: [], methods: [], commonMistakes: [], examples: [], takeaways: sentences.slice(-3) };
  }
  async generateFlashcards(text: string, count = 5) {
    return text.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean).slice(0, count).map((sentence, index) => ({ question: `Que faut-il retenir de la notion ${index + 1} ?`, answer: sentence }));
  }
  async generateQuiz(text: string, count = 5) {
    return text.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean).slice(0, count).map((sentence) => ({ question: `Explique cette notion : ${sentence.slice(0, 100)}`, answer: sentence, choices: [], type: "short_answer" as const }));
  }
}

export function getAIProvider(): AIProvider { return new LocalAIProvider(); }