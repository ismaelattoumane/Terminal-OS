export type StudySheetContent = {
  summary: string;
  keyIdeas: string[];
  definitions: string[];
  formulas: string[];
  methods: string[];
  commonMistakes: string[];
  examples: string[];
  takeaways: string[];
  chapters: string[];
  concepts: string[];
};

export interface AIProvider {
  readonly name: string;
  readonly available: boolean;
  generateStudySheet(text: string): Promise<StudySheetContent>;
  generateFlashcards(text: string, count?: number): Promise<Array<{ question: string; answer: string }>>;
  generateQuiz(text: string, count?: number): Promise<Array<{ question: string; answer: string; choices: string[]; type: "short_answer" | "multiple_choice" | "true_false" }>>;
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 12);
}

function extractDefinitions(text: string): Array<{ term: string; definition: string }> {
  const lines = text.split(/\n|(?<=[.!?])\s+/);
  const defs: Array<{ term: string; definition: string }> = [];
  // Termes génériques de mise en page qui ne sont pas des notions à retenir.
  const genericTerms = /^(chapitre|le[cs]on|partie|section|exemple|d[ée]finition|remarque|attention|propri[ée]t[ée]|th[ée]or[èe]me|m[ée]thode|plan|objectif|conclusion|note)\b/i;
  const patterns: RegExp[] = [
    /^(.{2,40})\s*:\s*(.{10,300})$/,
    /^(.{2,40})\s+(est|sont|d\u00e9signe|signifie|correspond \u00e0|permet de)\s+(.{10,300})$/i,
    /d[\u00e9e]finition\s+(de|du)?\s*(.{2,40})\s*[\-:]\s*(.{10,300})/i,
  ];
  for (const line of lines) {
    const trimmed = line.trim();
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        if (pattern.source.startsWith("d[")) {
          const term = (match[2] ?? "").trim();
          const def = (match[3] ?? "").trim();
          if (term && def && term.length >= 3 && term.length <= 50 && !genericTerms.test(term)) defs.push({ term, definition: def });
        } else {
          const term = (match[1] ?? "").trim().replace(/[""()]/g, "");
          const def = (match[match.length - 1] ?? "").trim();
          if (term && def && term.length >= 3 && term.length <= 50 && !genericTerms.test(term)) defs.push({ term, definition: def });
        }
        break;
      }
    }
  }
  const seen = new Set<string>();
  return defs.filter((d) => { const k = d.term.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function uniqueQuestions<T extends { question: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => { const k = item.question.trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

export class LocalAIProvider implements AIProvider {
  readonly name = "local";
  readonly available = true;

  async generateStudySheet(text: string): Promise<StudySheetContent> {
    const sentences = sentencesOf(text);
    const summary = sentences.slice(0, 4).join(" ").slice(0, 1000);
    const definitions = extractDefinitions(text);
    const definitionTexts = definitions.slice(0, 12).map((d) => `${d.term} : ${d.definition}`);
    const chapters = text.split("\n").map((l) => l.trim()).filter((l) => l.length >= 4 && l.length <= 60 && /^[A-Z\u00c0-\u00d60-9]/.test(l) && !l.match(/[.!?:,;]$/)).slice(0, 8);
    const concepts = definitions.slice(0, 15).map((d) => d.term);
    const formulas = text.split("\n").filter((l) => /[=<>]/.test(l) && l.length <= 200).slice(0, 8);
    return { summary, keyIdeas: sentences.slice(0, 10), definitions: definitionTexts, formulas, methods: [], commonMistakes: [], examples: sentences.filter((s) => /exemple|par exemple|ex\./i.test(s)).slice(0, 5), takeaways: sentences.slice(-4), chapters, concepts };
  }

  async generateFlashcards(text: string, count = 8): Promise<Array<{ question: string; answer: string }>> {
    const cards: Array<{ question: string; answer: string }> = [];
    const definitions = extractDefinitions(text);
    for (const def of definitions.slice(0, count)) cards.push({ question: `Quelle est la définition de \u00ab ${def.term} \u00bb ?`, answer: def.definition });
    const sentences = sentencesOf(text);
    const capital = sentences.map((s) => s.match(/([A-Z\u00c0-\u00d6][a-z\u00e0-\u00f9]+(?:\s+[a-z\u00e0-\u00f9]+){1,5})/)).filter((m): m is RegExpMatchArray => !!m).map((m) => m[1]);
    const seen = new Set(cards.map((c) => c.question));
    for (const term of capital) {
      if (cards.length >= count) break;
      const q = `Que faut-il retenir \u00e0 propos de \u00ab ${term} \u00bb ?`;
      if (seen.has(q)) continue;
      seen.add(q);
      const ctx = sentences.find((s) => s.includes(term)) ?? "";
      cards.push({ question: q, answer: ctx });
    }
    return uniqueQuestions(cards).slice(0, count);
  }

  async generateQuiz(text: string, count = 5): Promise<Array<{ question: string; answer: string; choices: string[]; type: "short_answer" | "multiple_choice" | "true_false" }>> {
    const questions: Array<{ question: string; answer: string; choices: string[]; type: "short_answer" | "multiple_choice" | "true_false" }> = [];
    const definitions = extractDefinitions(text);
    for (const def of definitions.slice(0, count)) questions.push({ question: `Vrai ou faux : ${def.term} signifie \u00ab ${def.definition.slice(0, 80)} \u00bb.`, answer: "Vrai", choices: ["Vrai", "Faux"], type: "true_false" });
    const sentences = sentencesOf(text);
    for (const sentence of sentences.slice(0, count)) {
      if (questions.length >= count) break;
      questions.push({ question: `Expliquez en vos mots : ${sentence.slice(0, 120)}`, answer: sentence, choices: [], type: "short_answer" });
    }
    return uniqueQuestions(questions).slice(0, count);
  }
}

export class RemoteAIProvider implements AIProvider {
  readonly name: string;
  readonly available = true;
  private readonly baseUrl: string;
  private readonly model: string;
  constructor() {
    this.name = process.env.AI_PROVIDER ?? "remote";
    this.baseUrl = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = process.env.AI_MODEL ?? "gpt-4o-mini";
  }
  private async call(system: string, user: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: this.model, temperature: 0.4, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user.slice(0, 40000) }] }),
    });
    if (!response.ok) throw new Error(`IA distante : ${response.status} ${response.statusText}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }
  private parseJson(raw: string): Record<string, unknown> {
    const cleaned = raw.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/, "");
    try { return JSON.parse(cleaned); } catch { const m = cleaned.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); return {}; }
  }
  async generateStudySheet(text: string): Promise<StudySheetContent> {
    const raw = await this.call("Tu es un assistant pédagogique. Produis un objet JSON strict avec les clés : summary, keyIdeas, definitions, formulas, methods, commonMistakes, examples, takeaways, chapitres, concepts. Sois concis et utile pour réviser.", text);
    const d = this.parseJson(raw);
    return { summary: String(d.summary ?? ""), keyIdeas: wrap(d.keyIdeas), definitions: wrap(d.definitions), formulas: wrap(d.formulas), methods: wrap(d.methods), commonMistakes: wrap(d.commonMistakes), examples: wrap(d.examples), takeaways: wrap(d.takeaways), chapters: wrap(d.chapters ?? d.chapitres), concepts: wrap(d.concepts) };
  }
  async generateFlashcards(text: string, count = 8): Promise<Array<{ question: string; answer: string }>> {
    const raw = await this.call(`Génère ${count} flashcards JSON : { "cards": [{ "question", "answer" }] }. Variées (définition, concept, vrai/faux). Jamais de questions génériques.`, text);
    const d = this.parseJson(raw);
    const cards = Array.isArray(d.cards) ? d.cards : Array.isArray(d) ? d : [];
    const validCards = cards
      .filter((c): c is { question: string; answer: string } => !!c && typeof (c as { question?: string }).question === "string" && typeof (c as { answer?: string }).answer === "string")
      .map((c) => ({ question: c.question.trim(), answer: c.answer.trim() }));
    return uniqueQuestions(validCards.filter((c) => c.question.length >= 10 && c.answer.length >= 5 && !/sujet de ce cours/i.test(c.question)));
  }
  async generateQuiz(text: string, count = 5): Promise<Array<{ question: string; answer: string; choices: string[]; type: "short_answer" | "multiple_choice" | "true_false" }>> {
    const raw = await this.call(`Génère ${count} questions JSON : { "questions": [{ "question", "answer", "choices", "type" }] }. type parmi short_answer, multiple_choice, true_false. Pas de questions absurdes.`, text);
    const d = this.parseJson(raw);
    const out: Array<{ question: string; answer: string; choices: string[]; type: "short_answer" | "multiple_choice" | "true_false" }> = [];
    for (const q of Array.isArray(d.questions) ? d.questions : []) {
      if (!q || typeof (q as { question?: unknown }).question !== "string" || typeof (q as { answer?: unknown }).answer !== "string") continue;
      const typed = q as { question: string; answer: string; choices?: unknown; type?: unknown };
      const type = ["short_answer", "multiple_choice", "true_false"].includes(String(typed.type)) ? (typed.type as "short_answer" | "multiple_choice" | "true_false") : "short_answer";
      out.push({ question: typed.question.trim(), answer: typed.answer.trim(), choices: Array.isArray(typed.choices) ? typed.choices.map(String) : [], type });
    }
    return uniqueQuestions(out);
  }
}

function wrap(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }

export function getAIProvider(): AIProvider {
  if (process.env.AI_API_KEY) return new RemoteAIProvider();
  return new LocalAIProvider();
}
