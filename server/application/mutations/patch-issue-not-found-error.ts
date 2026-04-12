export class PatchIssueNotFoundError extends Error {
  readonly issueId: string;

  constructor(issueId: string) {
    super(`Canonical issue "${issueId}" was not found.`);
    this.name = "PatchIssueNotFoundError";
    this.issueId = issueId;
  }
}
