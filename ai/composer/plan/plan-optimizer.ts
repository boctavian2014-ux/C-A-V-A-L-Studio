import type { ComposerPlan, ComposerPlanStep } from "../types";

export class PlanOptimizer {
  optimize(plan: ComposerPlan): ComposerPlan {
    const seen = new Set<string>();
    const steps: ComposerPlanStep[] = [];

    for (const step of plan.steps) {
      const key = `${step.title}:${step.files.sort().join(",")}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      const previous = steps.at(-1);
      if (previous && previous.risk === step.risk && this.overlaps(previous.files, step.files)) {
        previous.title = `${previous.title}; ${step.title}`;
        previous.rationale = `${previous.rationale}\n${step.rationale}`;
        previous.files = [...new Set([...previous.files, ...step.files])];
        previous.symbols = [...new Set([...previous.symbols, ...step.symbols])];
      } else {
        steps.push({ ...step, files: [...new Set(step.files)], symbols: [...new Set(step.symbols)] });
      }
    }

    return {
      ...plan,
      steps,
      risks: [...new Set(plan.risks)]
    };
  }

  private overlaps(left: string[], right: string[]): boolean {
    return left.some((file) => right.includes(file));
  }
}
