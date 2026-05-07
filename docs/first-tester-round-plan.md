# MapleCard First Tester Round Plan

## Round Shape

- target tester count: 3 to 5 people
- target session length: 10 to 15 minutes each
- format: live walkthrough or controlled self-serve demo with a short follow-up
- environment: staging frontend with the existing demo feedback issue workflow

## Core Flows To Test

- yogurt flow
- coffee flow
- duplicate yogurt lines flow
- normal grocery list flow
- empty input and safe error handling flow

## Suggested Session Structure

1. Give the tester the controlled tester packet.
2. Ask them to read the short product description and limitations.
3. Have them run the five target flows in sequence.
4. Ask them to copy a feedback report for at least one successful flow and one
   confusing or broken flow.
5. Capture any verbal reactions that do not fit cleanly into the copied report.

## What Success Looks Like

- testers understand what MapleCard is trying to do without extra explanation
- testers can complete the yogurt and coffee flows without getting stuck
- duplicate-line clarifications feel understandable and distinct
- normal grocery lists return results that feel coherent enough for a demo
- empty-input handling feels safe and obvious rather than broken
- testers can copy and file feedback without extra support
- the team can classify most issues quickly using the existing triage guide

## What Failure Looks Like

- testers cannot explain the product value after using it
- clarification questions feel confusing, redundant, or untrustworthy
- duplicate lines still feel merged together from the tester's perspective
- feedback copying is confusing or incomplete
- safe error handling feels like a crash instead of a guided failure
- most feedback ends up blocked on reproduction because reports are too vague
- issues cluster around one core flow strongly enough to stop further tester
  sharing

## Feedback Categories To Watch Closely

- parser issue
- clarification issue
- frontend UX issue
- backend error
- staging/deployment issue
- known limitation
- real-data gap

## How To Decide Next Sprint Priorities

Prioritize issues in this order:

1. demo blockers that make staging unusable or untrustworthy
2. broken core flows across yogurt, coffee, duplicate lines, or feedback copy
3. confusing UX that repeatedly causes hesitation, wrong answers, or lost trust
4. smaller wording or catalog improvements with clear bounded fixes
5. known limitations or real-data gaps that should be documented but not solved
   yet

If the same issue appears across multiple testers, convert it into a sprint task
instead of leaving it as isolated feedback.

If a report is valid but mostly caused by synthetic data or missing real-world
systems, close it as a known limitation and keep the next sprint focused on demo
quality and core product understanding.