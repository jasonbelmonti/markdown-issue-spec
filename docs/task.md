# TASK.md

Status: Positioning note for an agent-focused task document

## 1. The Missing Layer

Agent workflows already have two Markdown artifacts that are becoming common:

- `AGENTS.md` explains how an agent should behave in a given environment.
- `SKILL.md` explains how an agent performs a reusable class of work.

What is still missing is a first-class artifact for the work itself.

Today, "what needs to be done" is usually scattered across chat threads, issue
trackers, PR comments, and one-off prompts. That makes the actual assignment
hard to diff, hard to hand off, hard to verify, and easy to lose when context
windows reset or tools change.

`TASK.md` is the missing layer: Markdown for the work contract itself.

## 2. Core Claim

`TASK.md` defines what needs to be done, independent of who or what does it.

At minimum, a good task document captures:

- the objective
- the relevant context and constraints
- materially verifiable success criteria
- execution notes that help the next human or agent start well

That sounds simple because it is simple. The value is not novelty. The value is
separating the work definition from agent behavior and agent capability.

## 3. Separation of Concerns

These three documents do different jobs:

- `AGENTS.md`: how to operate here
- `SKILL.md`: how to perform a kind of work
- `TASK.md`: what outcome is required now

Without this separation, teams tend to overload one document with another
document's job:

- repo instructions start carrying task-specific demands
- skill definitions start embedding project-specific goals
- chat history becomes the only place where the real assignment exists

That is brittle for humans and worse for agents. Agents work best when the
assignment is explicit, stable, and easy to parse.

## 4. Why Agents Especially Need It

Agents do not just need instructions. They need a durable contract.

`TASK.md` improves agent workflows in a few important ways:

- Delegation: another agent can pick up the task without replaying the whole thread.
- Resumption: work survives model swaps, context loss, and handoffs.
- Verification: success criteria are explicit instead of implied.
- Routing: planners can choose the right agent or skill from the task itself.
- Auditability: the task definition is diffable and reviewable like code.
- Portability: the work item is not trapped inside one vendor UI or session log.

This is the difference between "please go do the thing from earlier" and a real,
addressable work object.

## 5. Why Markdown Is the Right Format

Markdown is a strong fit because it is already where technical teams live:

- easy for humans to read and edit
- easy for agents to parse
- natural in Git and code review
- portable across editors and platforms
- compatible with frontmatter when structured metadata is needed
- durable outside any single tool, tracker, or model provider

Markdown is not the point. Portability is the point. Markdown just happens to
be the least annoying common denominator.

## 6. Why This Is Better Than "Just Use Issues"

Traditional issue trackers are useful, but they are not a complete substitute
for an agent-focused task document.

A tracker record is often optimized for workflow state, comments, and reporting.
`TASK.md` is optimized for execution clarity:

- one place for the assignment
- one place for acceptance criteria
- one place for constraints and likely touch points
- one portable document that can travel with the codebase

You can still sync with Linear, GitHub, or anything else. The point is that the
canonical execution brief should not disappear into a SaaS field or a chat log.

## 7. What Good TASK.md Looks Like

A useful baseline shape is:

### Objective

What are we trying to achieve, and why does it matter?

### Context / Constraints

What background, dependencies, assumptions, and non-goals matter?

### Materially verifiable success criteria

What can be checked objectively to decide whether the task is done?

### Execution notes

What approach, files, systems, risks, or open questions should the next actor
know before starting?

This gives both humans and agents a shared definition of done without forcing
every team into a heavyweight project-management ontology on day one.

## 8. The Pitch

If `AGENTS.md` is the operating manual and `SKILL.md` is the playbook,
`TASK.md` is the mission.

It gives agent systems a clean unit of intent: explicit, portable, reviewable,
and verifiable. That is the real value proposition.

The claim is straightforward:

`AGENTS.md` tells an agent how to behave here.
`SKILL.md` tells an agent how to do a kind of work.
`TASK.md` tells an agent what needs to be done.
