export class TransitionIssueNotFoundError extends Error {
  readonly issueId: string;

  constructor(issueId: string) {
    super(`Canonical issue "${issueId}" was not found.`);
    this.name = "TransitionIssueNotFoundError";
    this.issueId = issueId;
  }
}
