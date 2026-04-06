export type ValidationSeverity = "error" | "warning";

export type ValidationCode = string;

export interface ValidationError {
  code: ValidationCode;
  severity: ValidationSeverity;
  message: string;
  issue_id?: string;
  file_path: string;
  field_path?: string;
  related_issue_ids?: string[];
}
