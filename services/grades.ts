export type Gradable = { grade: number; maxGrade: number; coefficient: number };

/**
 * B23 : moyenne générale pondérée par coefficient, calculée de la même façon
 * partout (dashboard + statistiques) pour éviter deux chiffres contradictoires.
 * Formule : somme( (note/barème)*20*coef ) / somme(coef), ramenée sur 20.
 */
export function weightedAverageOn20(grades: Gradable[]): number | null {
  const totalCoefficients = grades.reduce((sum, grade) => sum + (grade.coefficient > 0 ? grade.coefficient : 0), 0);
  if (!totalCoefficients) return null;
  const weighted = grades.reduce((sum, grade) => {
    const ratio = grade.maxGrade > 0 ? grade.grade / grade.maxGrade : 0;
    return sum + ratio * 20 * (grade.coefficient > 0 ? grade.coefficient : 0);
  }, 0);
  return Math.round((weighted / totalCoefficients) * 100) / 100;
}
