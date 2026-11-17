import { keywordPattern } from "../../compare/presentation.ts";

export function choiceExpression(choice: string): RegExp {
  const horizontal = /^(yes|no)$/i.test(choice)
    ? "|^[^\\p{L}\\p{N}\\n]*Yes[ \\t]+No[^\\p{L}\\p{N}\\n]*$"
    : "";

  return new RegExp(
    `(?:^|/)[^\\p{L}\\p{N}\\n]*${keywordPattern(choice).source}(?=[^\\p{L}\\p{N}\\n]*(?:\\([^\\n)]*\\))?(?:$|/))${horizontal}`,
    "imu",
  );
}
