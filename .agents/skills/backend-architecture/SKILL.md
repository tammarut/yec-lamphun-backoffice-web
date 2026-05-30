---
name: backend-architecture
description: Design and implement production-grade backend systems in Golang with strong domain modeling, explicit contracts, and operational rigor. Use this skill when the user asks to design APIs, services, data models, or backend systems. Avoid generic CRUD scaffolding and framework-driven architectures.
license: Complete terms in LICENSE.txt
---

# Backend-Architecture

This skill guides the creation of distinctive, production-grade backend systems in Golang that avoid generic “AI slop” such as thin CRUD layers, anemic domain models, and copy-paste microservice templates.

The user provides backend requirements: an API, service, data model, system design, or performance/scalability problem. They may include business context, constraints, or non-functional requirements.

---

## System Thinking

Before coding, deeply understand the system and commit to a CLEAR architectural direction:

- **Domain**: What problem is this system solving? What are the core business invariants?
- **Boundaries**: What belongs inside the service vs outside? What is explicitly NOT its responsibility?
- **Workload**: Read-heavy, write-heavy, latency-sensitive, bursty, or long-running?
- **Consistency**: Strong vs eventual. Where are guarantees required?
- **Failure**: What must never break? What can degrade gracefully?
- **Differentiation**: What makes this backend resilient, understandable, and boring to operate?

**CRITICAL**: Choose a clear architectural stance and execute it consistently.
Over-flexible systems rot; intentionally constrained systems scale.

---

## Backend Architecture Principles

Focus on:

### **Domain Modeling**

- Model business concepts explicitly (not just tables or DTOs)
- Encode invariants in code, not documentation
- Avoid anemic models and “service-as-a-function” designs
- Domain logic must be testable in isolation

### **Explicit Contracts**

- APIs are contracts, not implementation details
- Inputs are validated at boundaries
- Outputs are deterministic and documented
- Errors are structured and meaningful

### **Intentional Simplicity**

- Reject speculative abstractions
- No framework-first design
- Every interface must justify its existence
- Prefer explicit control flow over hidden magic

### **Operational Reality**

- Design for observability from day one
- Make failure states obvious and debuggable
- Optimize for maintainers, not cleverness

---

## Golang Implementation Guidelines

### Code Quality

- Idiomatic Go only
- Follow the Uber Go Style Guide
- Small, cohesive packages
- No global mutable state

### Interfaces

- Defined at the point of use
- Minimal method sets
- No “god interfaces”
- Prefer concrete types until substitution is proven necessary

### Concurrency

- Context is mandatory for all request-scoped work
- Goroutine lifecycles must be bounded
- Channels only when they model the problem naturally
- Avoid shared mutable state unless clearly justified

### Errors

- Errors are values
- Wrap with context, not noise
- Distinguish:
  - Domain errors
  - Infrastructure errors
  - Transport errors

---

## API & Transport Guidelines

- No business logic in handlers
- Handlers translate transport → domain → response
- Idempotency where applicable
- Timeouts and cancellation enforced

Supported transports may include:

- HTTP/REST
- gRPC
- Async messaging (Kafka, NATS, SQS)

Transport choice must match the problem, not trends.

---

## Data & Persistence Guidelines

- Schema reflects access patterns
- Indexes are deliberate and measured
- Migrations are forward-only
- Soft deletes, auditing, and versioning are explicit decisions

Avoid:

- ORM-driven domain design
- Implicit cascading behavior
- Hidden transactional boundaries

---

## Security & Safety

- Least privilege by default
- Explicit trust boundaries
- Validate all external input
- Fail closed, not open

Security is a design property, not a checklist.

---

## Output Requirements

When using this skill, responses MUST:

- Implement real, working Go code
- Be production-grade and testable
- Avoid tutorial-style scaffolding
- Include only necessary abstractions
- Reflect a consistent architectural stance

---

## Anti-Patterns to Avoid (CRITICAL)

NEVER generate:

- Thin CRUD services with no domain logic
- Framework-shaped architectures
- God services or god repositories
- Over-generic repositories
- “Clean Architecture” diagrams without real boundaries
- Magic helpers that hide control flow

Every backend should feel **deliberately designed**, not generated.

Remember: A great backend is not flashy.
It is boring, predictable, explicit — and extremely hard to misuse.
