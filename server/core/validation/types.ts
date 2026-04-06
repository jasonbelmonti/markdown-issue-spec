export type FrontmatterValidationSource = "profile" | "schema";

export interface FrontmatterValidationError {
  code: string;
  source: FrontmatterValidationSource;
  path: string;
  message: string;
  details?: Record<string, unknown>;
}
