# MapleCard Feedback Review Checklist

Use this checklist when reviewing copied demo feedback reports and related
GitHub issues.

## Correlation And Privacy Checks

- check whether `requestId` is present
- check whether `errorId` is present when the issue involves a failure
- check whether raw input was included intentionally
- confirm raw shopping-list text was not included accidentally

## Classification Checks

- classify the issue using the categories in `docs/feedback-triage.md`
- assign a priority level
- check whether the issue affects the staging demo flow directly
- check whether the issue affects frontend UX
- check whether the issue affects parser behavior
- check whether the issue affects clarification behavior
- check whether the issue affects rate limiting or safe error handling
- check whether the issue is better explained as a known real-data gap

## Decision Checks

- decide whether to close as a known limitation
- decide whether to create a follow-up issue
- decide whether to convert the issue into a sprint task
- decide whether the issue still needs reproduction

## Review Notes To Capture

- what the tester tried
- what the tester expected
- what actually happened
- whether the issue is repeatable
- whether Railway or Vercel logs support the report
- whether the issue should influence the next sprint plan