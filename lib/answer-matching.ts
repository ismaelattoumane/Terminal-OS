/**
 * B19 : comparaison tolérante des réponses de quiz.
 * La comparaison stricte `trim().toLowerCase()` produisait des faux négatifs
 * (accents, ponctuation, articles...). On normalise les deux côtés :
 * minuscules, accents retirés, ponctuation/espaces réduits, articles courants
 * retirés en début de réponse.
 */

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // ponctuation et symboles
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(le|la|les|l|un|une|des|de|du|d|the)\s+/, "")
    .trim();
}

export function answersMatch(expected: string, given: string): boolean {
  const left = normalizeAnswer(expected);
  const right = normalizeAnswer(given);
  if (!left || !right) return false;
  if (left === right) return true;
  // Tolérance : la réponse donnée est contenue dans l'attendue (ou inversement)
  // dès qu'elle est assez longue pour éviter les faux positifs d'une lettre.
  if (right.length >= 4 && left.includes(right)) return true;
  if (left.length >= 4 && right.includes(left)) return true;
  return false;
}
