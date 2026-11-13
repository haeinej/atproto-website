# Agent document outline

Use this as a coverage guide, not text to paste unchanged. Prefer an existing
reference over a new file. Keep only sections the completed outcome needs, and
link to authoritative contracts instead of copying them into several places.

## Purpose and boundary

State the problem, resulting behavior and scope. Distinguish implemented behavior
from planned work and say what evidence supports the implementation. Link the
human guide for the experience this contract enables.

## Entry points and flow

Name the actual modules, requests, commands or UI entry points. Explain how input
becomes a result, where state lives, and which component owns each step. Link the
implementation and any generated schema or capability reference.

## Dependencies and reasons

For each required dependency, give its direction, role and reason. Distinguish
build-time, runtime and optional dependencies where relevant. State the setup,
version or authentication constraint and the failure when it is absent. Do not
list packages that have no bearing on integrating or changing this outcome.

## Contracts and invariants

Describe inputs, outputs, validation, ownership, authorization, side effects,
compatibility and concurrency guarantees that apply. State what callers must
preserve and what they must never infer. Use exact names from the implementation.

## Use and recovery

Give the smallest valid example with its working directory and prerequisites.
Explain errors and the correct recovery, including retries, partial completion,
stale state and any irreversible step. Do not include real credentials or data.

## Verification and limits

Give reproducible checks and the behavior they establish. Separate unit checks,
stand-in integrations, browser evidence and live verification. State unavailable
parts and the boundary they leave, without turning the guide into a task log.

## Maintenance

Name the authored sources, regeneration commands if any, and related human guide
or references to update when behavior changes. Keep navigation and cross-links
working so the next agent can find this contract.
