import { z } from "zod";
import { resumeContentSchema } from "@/lib/resume/fabrication";

export const helloWorldSchema = z.object({
  greeting: z.string().min(1),
  echo: z.string().min(1),
});

export type HelloWorldResponse = z.infer<typeof helloWorldSchema>;

export const jdParseSchema = z.object({
  company: z.string().optional().default(""),
  role: z.string().optional().default(""),
  seniority: z.string().optional().default(""),
  must_have_keywords: z.array(z.string()).optional().default([]),
  nice_to_have_keywords: z.array(z.string()).optional().default([]),
  responsibilities: z.array(z.string()).optional().default([]),
  requirements: z.array(z.string()).optional().default([]),
  tech_stack: z.array(z.string()).optional().default([]),
  location: z.string().optional().default(""),
  remote_policy: z.string().optional().default(""),
});

export type JdParseResponse = z.infer<typeof jdParseSchema>;

export const SCHEMAS_BY_KIND: Record<string, z.ZodType> = {
  hello_world: helloWorldSchema,
  jd_parse: jdParseSchema,
  resume: resumeContentSchema,
};
