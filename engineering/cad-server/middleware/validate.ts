import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { cadBadRequest } from "./errors";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(16_000),
});

const constraintsSchema = z
  .object({
    budget: z.string().max(200).optional(),
    dimensions: z.string().max(200).optional(),
    voltage: z.string().max(100).optional(),
    autonomy: z.string().max(100).optional(),
    weight: z.string().max(100).optional(),
    skillLevel: z.string().max(50).optional(),
  })
  .strict()
  .optional();

const planContextSchema = z
  .object({
    requirements: z.string().max(4_000).optional(),
    assembly: z.string().max(4_000).optional(),
    components: z.string().max(4_000).optional(),
    performance: z.string().max(4_000).optional(),
  })
  .strict()
  .optional();

const attachmentSchema = z.object({
  path: z.string().max(500),
  name: z.string().max(200),
  content: z.string().max(8_000),
});

export const createCadJobSchema = z
  .object({
    prompt: z.string().trim().min(3).max(12_000),
    projectType: z.string().max(64).optional(),
    constraints: constraintsSchema,
    cavalId: z.string().max(128).optional(),
    planContext: planContextSchema,
    openRouterApiKey: z.string().max(256).optional(),
    meshApiKey: z.string().max(256).optional(),
    quality: z.enum(["standard", "high"]).optional(),
    conversationHistory: z.array(chatMessageSchema).max(32).optional(),
    previousScad: z.string().max(64_000).optional(),
    generationMode: z.enum(["openscad", "mesh", "library"]).optional(),
    meshPrompt: z.string().max(12_000).optional(),
    previousMeshTaskId: z.string().max(128).optional(),
    attachments: z.array(attachmentSchema).max(8).optional(),
  })
  .strict();

export const planPrint3DSchema = z
  .object({
    messages: z.array(chatMessageSchema).max(32).default([]),
    latestUserText: z.string().trim().min(1).max(12_000),
    openRouterApiKey: z.string().max(256).optional(),
    meshApiKey: z.string().max(256).optional(),
    previousMeshTaskId: z.string().max(128).optional(),
  })
  .strict();

export const jobIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const validateBody =
  <T extends z.ZodType>(schema: T) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      next(cadBadRequest(message || "Invalid request body"));
      return;
    }
    request.body = parsed.data;
    next();
  };

export const validateParams =
  <T extends z.ZodType>(schema: T) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      next(cadBadRequest("Invalid job id"));
      return;
    }
    request.params = parsed.data as typeof request.params;
    next();
  };
