# MapleCard Feedback Triage Guide

Use this guide to turn copied staging feedback reports into consistent GitHub issues and follow-up sprint work.

## How To Read A Copied Feedback Report

Start with these fields first:

- `environmentLabel`
- `frontendMode`
- `backendBaseUrlOrigin`
- `requestId`
- `errorId`
- `answerResultStatuses`
- `parsedItemCount`
- `clarificationQuestionCount`
- `duplicateLineIdsPresent`
- `lastSafeFrontendErrorMessage`
- `rawInputIncluded`

Then compare the report with the tester's written summary:

- what flow they ran
- what they expected
- what actually happened
- whether the issue is repeatable

## Using RequestId And ErrorId With Railway And Vercel Logs

- Use `requestId` to search Railway backend logs for the exact optimize request.
- Use `errorId` to narrow failures to the specific validation, controlled error,
	or unexpected error path.
- Use Vercel logs mainly for frontend rendering or deployment issues, not
	backend request tracing.
- If the copied report includes a safe frontend error message, compare it with
	Railway request logs and the related backend response path.
- Do not expect stack traces or provider secrets in the copied report; those are
	intentionally excluded.

## Triage Categories

Use one primary category per issue:

- `parser issue`: incorrect parsed items, missing intent recognition, wrong
	normalization, or bad line interpretation
- `clarification issue`: wrong question, wrong answer application, line
	targeting confusion, duplicate-line problems
- `frontend UX issue`: confusing copy, unclear state, layout problems,
	copy-to-clipboard friction, poor mobile behavior
- `backend error`: safe 4xx/5xx responses, controlled service failures,
	unexpected error paths, rate-limit confusion
- `staging/deployment issue`: app unavailable, broken build, CORS issue,
	unhealthy staging environment, bad deploy config
- `known limitation`: expected gap already documented, such as synthetic data
	or no checkout
- `real-data gap`: issue is fundamentally caused by synthetic coverage rather
	than a bug in current demo flow

## Suggested Priority Levels

- `P0 demo blocker`: breaks the demo entirely or makes staging unusable in front
	of testers
- `P1 broken core flow`: blocks yogurt, coffee, duplicate-line, or
	feedback-copy flows
- `P2 confusing UX`: core flow works, but users are likely to misunderstand or
	mistrust the app
- `P3 catalog/wording improvement`: smaller correctness or clarity improvements
	with limited demo impact
- `P4 future enhancement`: useful but not necessary for the current
	staging/demo loop

## When To Close As Known Limitation

Close as a known limitation when:

- the issue is already documented in the staging or feedback guides
- the requested behavior would require real retailer data, checkout,
	persistence, or production systems that MapleCard does not support yet
- the report is accurate, but the current staging product intentionally does not
	solve that case yet

When closing as a known limitation, link the relevant docs and explain why the
current staging build behaves that way.

## When To Create A Follow-Up Sprint Task

Create a follow-up sprint task when:

- the issue repeats across testers or flows
- the issue affects a core demo path
- the issue weakens confidence in the shopping-intelligence flow even if it does
	not crash
- the issue is not already a documented limitation
- the fix is bounded enough to fit a sprint slice

Prefer a sprint task instead of an open-ended issue when the next action is
already clear and implementation-ready.