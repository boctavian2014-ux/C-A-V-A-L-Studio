import fs from "node:fs/promises";

import path from "node:path";

import { DebugAgent } from "../agents/debug";

import { RefactorAgent } from "../agents/refactor";

import { ReasoningAgent } from "../agents/reasoning";

import { AIClient } from "../ai-client";

import { codeReviewApi } from "../review/code-review-api";
import { codeReviewActions } from "../review/code-review-actions";

import { sessionToAcceptedPatchSet } from "../review/diff-parser";

import { ModelRouter } from "../model-router";

import { suggestionsApi } from "../suggestions/suggestions-api";
import { logicFlowPipelineEmitter, pipelineEventBus } from "../../components/ui/logicflow/logicflow-pipeline-emitter";

import { ContextExpander } from "./context/context-expander";

import { ContextMerger } from "./context/context-merger";

import { ContextReducer } from "./context/context-reducer";

import { AtomicPatchApplier } from "./patch/patch-applier";

import { PatchFormatter } from "./patch/patch-formatter";

import { ComposerPatchGenerator } from "./patch/patch-generator";

import { PatchValidator } from "./patch/patch-validator";

import { ConflictResolver } from "./patch/conflict-resolver";

import { ComposerPlanGenerator } from "./plan/plan-generator";

import { PlanOptimizer } from "./plan/plan-optimizer";

import { PlanValidator } from "./plan/plan-validator";

import { RollbackEngine } from "./rollback/rollback-engine";

import { SnapshotManager } from "./rollback/snapshot-manager";

import type { ComposerDiagnostic, ComposerPlan, ComposerRequest, ComposerResult } from "./types";

import { BuildChecker } from "./validation/build-checker";

import { SyntaxChecker } from "./validation/syntax-checker";

import { TestRunner } from "./validation/test-runner";



const emptyPlan = (objective: string): ComposerPlan => ({

  objective,

  steps: [],

  risks: [],

  validation: []

});



export class AIComposer {

  constructor(

    private readonly modelRouter = new ModelRouter(),

    private readonly ai = new AIClient(modelRouter),

    private readonly agents = {

      debug: new DebugAgent(),

      refactor: new RefactorAgent(),

      reasoning: new ReasoningAgent()

    },

    private readonly context = {

      expander: new ContextExpander(),

      reducer: new ContextReducer(),

      merger: new ContextMerger()

    },

    private readonly plan = {

      generator: new ComposerPlanGenerator(ai),

      validator: new PlanValidator(),

      optimizer: new PlanOptimizer()

    },

    private readonly patch = {

      generator: new ComposerPatchGenerator(ai),

      formatter: new PatchFormatter(),

      validator: new PatchValidator(),

      resolver: new ConflictResolver(),

      applier: new AtomicPatchApplier()

    },

    private readonly validation = {

      syntax: new SyntaxChecker(),

      build: new BuildChecker(),

      tests: new TestRunner()

    },

    private readonly rollback = {

      snapshots: new SnapshotManager(),

      engine: new RollbackEngine()

    }

  ) {}



  async run(request: ComposerRequest): Promise<ComposerResult> {

    const diagnostics: ComposerDiagnostic[] = [];

    let rolledBack = false;

    pipelineEventBus.emit({
      type: "pipeline.start",
      timestamp: Date.now(),
      meta: { objective: request.objective, workspaceRoot: request.workspaceRoot }
    });



    const expanded = await this.context.expander.expand(request.objective, request.workspaceRoot);

    const reduced = this.context.reducer.reduce(expanded);

    const merged = this.context.merger.merge(reduced);

    logicFlowPipelineEmitter.emit({ nodeId: request.skipSuggestions ? "composer" : "suggestions" });

    if (!request.skipSuggestions) {

      const existing = suggestionsApi.getCurrent();

      const approved =

        existing &&

        (existing.status === "approved" || existing.status === "proceeded") &&

        (!request.suggestionSessionId || existing.id === request.suggestionSessionId);



      if (!approved) {

        logicFlowPipelineEmitter.emit({ nodeId: "suggestions" });

        const bundle = await suggestionsApi.submitRequest(request.objective, request.workspaceRoot);

        return {

          ok: true,

          phase: "awaiting_suggestions",

          plan: emptyPlan(request.objective),

          patchSet: { summary: "", files: [] },

          changedFiles: [],

          diagnostics: [{

            level: "info",

            source: "suggestions",

            message: "Review AI suggestions before patch generation."

          }],

          rolledBack: false,

          suggestions: bundle

        };

      }



      if (request.approvedAlternativeId) {

        suggestionsApi.approve({

          sessionId: existing!.id,

          alternativeId: request.approvedAlternativeId

        });

      }

    }



    logicFlowPipelineEmitter.emit({ nodeId: "composer", edgeId: "e1" });

    const generatedPlan = await this.plan.generator.generate(merged, request.constraints ?? []);

    const optimizedPlan = this.plan.optimizer.optimize(generatedPlan);

    diagnostics.push(...await this.plan.validator.validate(optimizedPlan, merged));



    if (diagnostics.some((diagnostic) => diagnostic.level === "error")) {

      logicFlowPipelineEmitter.emit({ nodeId: "debug", edgeId: "e3" });
      pipelineEventBus.emit({
        type: "error.occurred",
        nodeId: "composer",
        message: diagnostics.find((d) => d.level === "error")?.message ?? "Plan validation failed",
        timestamp: Date.now(),
        meta: { diagnostics }
      });

      return {

        ok: false,

        phase: "failed",

        plan: optimizedPlan,

        patchSet: { summary: "", files: [] },

        changedFiles: [],

        diagnostics,

        rolledBack

      };

    }



    const patchSet = this.patch.formatter.format(await this.patch.generator.generate(optimizedPlan, merged));

    diagnostics.push(...this.patch.validator.validate(request.workspaceRoot, patchSet));

    const conflicts = await this.patch.resolver.resolve(request.workspaceRoot, patchSet);

    diagnostics.push(...conflicts.diagnostics);



    if (conflicts.requiresUser || diagnostics.some((diagnostic) => diagnostic.level === "error")) {

      logicFlowPipelineEmitter.emit({ nodeId: "debug", edgeId: "e3" });
      pipelineEventBus.emit({
        type: "error.occurred",
        nodeId: "composer",
        message: diagnostics.find((d) => d.level === "error")?.message ?? "Patch conflict or validation error",
        timestamp: Date.now(),
        meta: { diagnostics }
      });

      return {

        ok: false,

        phase: "failed",

        plan: optimizedPlan,

        patchSet,

        changedFiles: [],

        diagnostics,

        rolledBack

      };

    }



    if (!request.skipReview) {

      const existingReview = codeReviewApi.getPatches(request.reviewSessionId);

      const readyToApply = existingReview?.status === "accepted" || existingReview?.status === "applied";



      if (!readyToApply) {

        logicFlowPipelineEmitter.emit({ nodeId: "review", edgeId: "e2" });

        const review = codeReviewApi.setPatches(request.workspaceRoot, conflicts.patchSet);

        return {

          ok: true,

          phase: "awaiting_review",

          plan: optimizedPlan,

          patchSet: conflicts.patchSet,

          changedFiles: [],

          diagnostics: [{

            level: "info",

            source: "code-review",

            message: "Review generated patches before applying to workspace."

          }],

          rolledBack: false,

          review

        };

      }

    }



    const acceptedPatchSet = request.skipReview

      ? conflicts.patchSet

      : sessionToAcceptedPatchSet(codeReviewApi.getPatches(request.reviewSessionId)!);



    const snapshot = await this.rollback.snapshots.create(

      request.workspaceRoot,

      acceptedPatchSet.files.map((file) => file.path)

    );

    const applyResult = await this.patch.applier.apply(request.workspaceRoot, acceptedPatchSet, request.dryRun);

    diagnostics.push(...applyResult.diagnostics.map((message) => ({

      level: "warning" as const,

      source: "patch-applier",

      message

    })));



    const syntaxFiles = await this.readChangedFiles(request.workspaceRoot, applyResult.changedFiles);

    diagnostics.push(...await this.validation.syntax.check(syntaxFiles));

    if (request.runBuild) diagnostics.push(...await this.validation.build.run(request.workspaceRoot));

    if (request.runTests) diagnostics.push(...await this.validation.tests.run(request.workspaceRoot));



    const failed = diagnostics.some((diagnostic) => diagnostic.level === "error");

    if (failed && !request.dryRun) {

      await this.rollback.engine.rollback(request.workspaceRoot, snapshot, applyResult.changedFiles);

      rolledBack = true;

    }



    void this.modelRouter;

    void this.agents;

    if (failed) {
      logicFlowPipelineEmitter.emit({ nodeId: "debug", edgeId: "e3" });
      pipelineEventBus.emit({
        type: "error.occurred",
        nodeId: "debug",
        message: diagnostics.find((d) => d.level === "error")?.message ?? "Post-apply validation failed",
        timestamp: Date.now(),
        meta: { diagnostics, rolledBack }
      });
    }

    pipelineEventBus.emit({
      type: "pipeline.finish",
      timestamp: Date.now(),
      meta: { ok: !failed, rolledBack, changedFiles: applyResult.changedFiles }
    });

    return {

      ok: !failed,

      phase: failed ? "failed" : "completed",

      plan: optimizedPlan,

      patchSet: acceptedPatchSet,

      changedFiles: applyResult.changedFiles,

      diagnostics,

      rolledBack

    };

  }



  async approveSuggestions(sessionId: string, alternativeId?: string) {

    return suggestionsApi.approve({ sessionId, alternativeId });

  }



  async proceedAfterSuggestions(sessionId: string, request: ComposerRequest, alternativeId?: string): Promise<ComposerResult> {

    await suggestionsApi.proceedToComposer(sessionId);

    return this.run({

      ...request,

      skipSuggestions: false,

      suggestionSessionId: sessionId,

      approvedAlternativeId: alternativeId

    });

  }



  async applyAfterReview(sessionId: string, request: ComposerRequest): Promise<ComposerResult> {

    const session = codeReviewApi.getPatches(sessionId);

    if (session && session.status === "pending") {

      await codeReviewActions.applySelected();

    }

    return this.run({

      ...request,

      skipSuggestions: true,

      skipReview: false,

      reviewSessionId: sessionId

    });

  }



  private async readChangedFiles(workspaceRoot: string, files: string[]): Promise<Array<{ path: string; content: string }>> {

    return Promise.all(files.map(async (file) => ({

      path: file,

      content: await fs.readFile(path.resolve(workspaceRoot, file), "utf8").catch(() => "")

    })));

  }

}


