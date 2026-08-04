export type CharacterFeedback = "pending" | "correct" | "incorrect";

export function typingAlignment(attempt: string, target: string) {
  const typed = [...attempt];
  const expected = [...target];
  const rows = Array.from({ length: typed.length + 1 }, () =>
    Array<number>(expected.length + 1).fill(0),
  );

  for (let typedIndex = 0; typedIndex <= typed.length; typedIndex += 1)
    rows[typedIndex][0] = typedIndex;
  for (let targetIndex = 0; targetIndex <= expected.length; targetIndex += 1)
    rows[0][targetIndex] = targetIndex;

  for (let typedIndex = 1; typedIndex <= typed.length; typedIndex += 1) {
    for (let targetIndex = 1; targetIndex <= expected.length; targetIndex += 1) {
      const substitution =
        rows[typedIndex - 1][targetIndex - 1] +
        (typed[typedIndex - 1] === expected[targetIndex - 1] ? 0 : 1);
      rows[typedIndex][targetIndex] = Math.min(
        substitution,
        rows[typedIndex - 1][targetIndex] + 1,
        rows[typedIndex][targetIndex - 1] + 1,
      );
    }
  }

  // Comparamos con el mejor prefijo del objetivo: lo que todavía no se
  // escribió debe quedar pendiente, no marcado como error.
  let targetPrefix = 0;
  let errors = rows[typed.length][0];
  for (let index = 1; index <= expected.length; index += 1) {
    const cost = rows[typed.length][index];
    if (cost < errors || (cost === errors && index > targetPrefix)) {
      errors = cost;
      targetPrefix = index;
    }
  }

  const feedback: CharacterFeedback[] = expected.map(() => "pending");
  let typedIndex = typed.length;
  let targetIndex = targetPrefix;
  let matches = 0;

  while (typedIndex > 0 || targetIndex > 0) {
    if (
      typedIndex > 0 &&
      targetIndex > 0 &&
      typed[typedIndex - 1] === expected[targetIndex - 1] &&
      rows[typedIndex][targetIndex] === rows[typedIndex - 1][targetIndex - 1]
    ) {
      feedback[targetIndex - 1] = "correct";
      matches += 1;
      typedIndex -= 1;
      targetIndex -= 1;
      continue;
    }
    if (
      typedIndex > 0 &&
      targetIndex > 0 &&
      rows[typedIndex][targetIndex] === rows[typedIndex - 1][targetIndex - 1] + 1
    ) {
      feedback[targetIndex - 1] = "incorrect";
      typedIndex -= 1;
      targetIndex -= 1;
      continue;
    }
    if (
      typedIndex > 0 &&
      rows[typedIndex][targetIndex] === rows[typedIndex - 1][targetIndex] + 1
    ) {
      const nearestTarget = Math.min(
        expected.length - 1,
        Math.max(0, targetIndex),
      );
      if (expected.length) feedback[nearestTarget] = "incorrect";
      typedIndex -= 1;
      continue;
    }
    if (targetIndex > 0) {
      feedback[targetIndex - 1] = "incorrect";
      targetIndex -= 1;
    }
  }

  return { feedback, matches, errors };
}

export function countPositionalMatches(attempt: string, target: string) {
  return typingAlignment(attempt, target).matches;
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
