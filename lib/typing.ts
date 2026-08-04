export function countPositionalMatches(attempt: string, target: string) {
  return [...attempt.slice(0, target.length)].filter(
    (character, index) => character === target[index],
  ).length;
}

export function completedLineStatus(attempt: string, target: string) {
  return attempt === target ? "perfect" : "partial";
}

export function shouldCompleteLine(attempt: string, target: string) {
  return attempt === target;
}

export function partialLinePoints(
  attempt: string,
  target: string,
  pointsPerCharacter = 3,
) {
  return countPositionalMatches(attempt, target) * pointsPerCharacter;
}
