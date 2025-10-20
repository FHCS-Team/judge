# Judgehost Features Roadmap

This document collects feature proposals, priorities, rough effort estimates, important files to change, and acceptance criteria. Use this as the single source of truth when picking work to implement.

**Note**: Judgehost is a containerized evaluation orchestration system, not an HTTP server. All features focus on core evaluation logic, reliability, security, and operations — no API endpoints.

**Timeline**: 1 month with 2-person team. Priorities: P0 (must-have), P1 (important), P2 (nice-to-have). Sizes: XS, S, M, L, XL.

---

## Quick Reference: Priority & Size Matrix

| Feature                        | Priority | Size | Person-Days | Phase |
| ------------------------------ | -------- | ---- | ----------- | ----- |
| #1: Logging & metrics          | P0       | S    | 2           | 1     |
| #2: Docker refactor            | P0       | M    | 3           | 2     |
| #3: RabbitMQ integration       | P0       | M    | 3           | 2     |
| #5: Tests & CI                 | P0       | M    | 3           | 1     |
| #6: Docs & rollout             | P0       | S    | 1           | 1     |
| #9: Security hardening         | P0       | M    | 2           | 2     |
| #10: Resource quotas           | P0       | M    | 2           | 2     |
| #17: Live container management | P0       | L    | 4           | 2     |
| #4: Observability & tracing    | P1       | M    | 2           | 3     |
| #7: Pluggable storage          | P1       | M    | 3           | 4     |
| #12: Artifact GC               | P1       | S    | 2           | 3     |
| #13: Webhook retries & DLQ     | P1       | S    | 2           | 3     |
| #16: Audit logging             | P1       | M    | 2           | 4     |
| #8: Evaluation plugins         | P2       | L    | 5           | 4     |
| #11: Kubernetes executor       | P2       | XL   | 8           | 4     |
| #14: Submission caching        | P2       | M    | 2           | 4     |
| #15: Image scanning            | P2       | M    | 2           | 4     |

**P0 Total: 22 person-days (11 per person over ~2.5 weeks) → MUST DO**
**P1 Total: 11 person-days (5.5 per person over ~1.5 weeks) → TRY TO DO**
**P2 Total: 17 person-days → DEFER TO NEXT RELEASE**

---

## 1. Prometheus-compatible logging & metrics [P0][S]

### Description

Structured JSON logging plus Prometheus metrics for key operations.

### Sub-tasks

- Emit structured JSON logs via pino
- Instrument key operations (submission queued, started, finished, container actions, webhook deliveries)
- Export metrics in Prometheus-compatible format (file-based or push gateway)

### Suggested files

`src/utils/logger.js`, `src/core/metrics.js`

### Acceptance

- Metrics available in Prometheus format
- Logs include stable fields (ts, level, service, requestId, labels)

### Additional notes

- Metrics exported via file or pushed to Prometheus Push Gateway.
- Use `prom-client` for metrics collection.

## 2. Refactor dockerode wrapper into modules [P0][M]

### Description

Replace ad-hoc dockerode usage with small focused modules (containers, networks, files, images, volumes) and an index facade.

### Sub-tasks

- Create modular docker wrappers for containers, networks, files, images, volumes
- Update codebase to use wrapper modules instead of direct dockerode calls
- Add unit tests for each wrapper module

### Suggested files

`src/core/docker/containers.js`, `src/core/docker/networks.js`, `src/core/docker/files.js`, `src/core/docker/images.js`, `src/core/docker/volumes.js`, `src/core/docker/index.js`

### Acceptance

- Existing behavior preserved
- All codebase uses wrappers instead of direct dockerode calls
- Unit tests cover wrapper contracts

### Dependencies

- **depends_on**: None
- **depended_by**: #9 (Security hardening), #10 (Resource quotas), #15 (Image scanning), #17 (Live container management)

### Additional notes

Maintain backward compatibility by creating a facade index.js that re-exports all wrappers.

---

## 3. RabbitMQ integration for job queueing [P0][M]

### Description

Provide a pluggable RabbitMQ backend for queueing submissions, with DLX/retry, prefetch, and graceful shutdown.

### Sub-tasks

- Implement RabbitMQ consumer and publisher
- Add Dead Letter Exchange (DLX) and retry logic
- Support prefetch and graceful shutdown
- Update queue.js to support pluggable backends with config flag

### Suggested files

`src/core/queue/rabbitmq.js`, `src/core/queue/backends.js`, update `src/core/queue.js`, config knobs

### Acceptance

- RabbitMQ backend can be enabled via config
- Messages are processed, acked, retried, and DLQed correctly
- Graceful shutdown closes connections properly

### Dependencies

- **depends_on**: None
- **depended_by**: #13 (Webhook DLQ)

### Additional notes

Support both in-process (default) and RabbitMQ backends. Make backend switchable via environment variable or config file.

---

## 4. Observability + distributed tracing [P1][M]

### Description

Add OpenTelemetry tracing, connect traces to logs and metrics, and enable export to collectors (Jaeger, Zipkin).

### Sub-tasks

- Instrument core operations with OpenTelemetry spans
- Connect traces to logs and metrics via correlation IDs
- Support trace export to Jaeger, Zipkin, or other OTLP collectors
- Document trace setup and collector configuration

### Suggested files

`src/telemetry/setup.js`, `docs/observability.md`, `docs/tracing-setup.md`

### Acceptance

- Traces and metrics emitted for main lifecycle operations (submission queued, started, finished, container actions)
- Traces are exportable to OTLP collectors (Jaeger, Zipkin, etc.)
- Correlation IDs flow through logs, metrics, and traces

### Dependencies

- **depends_on**: #1 (Prometheus-compatible logging & metrics)
- **depended_by**: None

### Additional notes

Use `@opentelemetry/api` and `@opentelemetry/sdk-node` for implementation. Export via OTLP gRPC/HTTP. Document collector setup (Jaeger all-in-one for local dev).

---

## 5. Tests, CI and migration notes [P0][M]

### Description

Add unit tests for logger, docker wrappers, and queue; add CI config and migration docs.

### Sub-tasks

- Write unit tests for #1 (logging & metrics), #2 (docker wrappers), #3 (RabbitMQ)
- Set up GitHub Actions CI workflow (lint, test, coverage)
- Create migration documentation for operators

### Suggested files

`tests/logger.test.js`, `tests/docker-wrappers.test.js`, `tests/rabbitmq.test.js`, `.github/workflows/ci.yml`, `docs/migrations.md`

### Acceptance

- CI runs tests on every commit
- Core modules have unit tests for main flows
- Test coverage >80% for instrumented modules
- Migration guide clear and actionable

### Dependencies

- **depends_on**: #1 (Prometheus logging), #2 (Docker wrappers), #3 (RabbitMQ)
- **depended_by**: #6 (Docs & rollout plan)

### Additional notes

Use Jest for testing. Run linters (eslint, prettier) as part of CI. Report coverage metrics.

---

## 6. Docs & rollout plan [P0][S]

### Description

Operator-facing rollout, feature flags and upgrade procedures.

### Sub-tasks

- Create feature gates and config knobs for progressive enablement
- Document rollout procedure with feature flags
- Provide rollback steps and troubleshooting guide

### Suggested files

`docs/architecture/features.md`, `docs/rolling_upgrade.md`, `config/features.yaml`

### Acceptance

- Clear operator guide for enabling/disabling features
- Feature flags working and documented
- Rollback steps tested and verified

### Dependencies

- **depends_on**: #1, #2, #3, #4, #5 (prior phases)
- **depended_by**: None

### Additional notes

Keep feature flags simple: one boolean per feature. Provide examples of before/after configurations. Document any breaking changes.

---

## 7. Pluggable artifact storage (S3, GCS, local) [P1][M]

### Description

Support local disk and S3/GCS backends for storing artifacts, with signed URL access and retention/GC policies.

### Sub-tasks

- Implement storage backend interface
- Add local disk storage implementation
- Add S3-compatible storage implementation
- Add Google Cloud Storage implementation
- Implement signed URL generation
- Add retention and GC policy support

### Suggested files

`src/storage/index.js`, `src/storage/local.js`, `src/storage/s3.js`, `src/storage/gcs.js`, `src/storage/policies.js`, config changes

### Acceptance

- Backend can be chosen via config
- Artifacts retrievable via signed URLs or internal API
- GC policies enforceable per backend
- Migration tooling provided

### Dependencies

- **depends_on**: None
- **depended_by**: #12 (Artifact lifecycle & GC)

### Additional notes

Use strategy pattern for backend abstraction. Support environment-based credentials for cloud storage. Provide CLI tool for migration between backends.

---

## 8. Evaluation plugin registry / SDK [P2][L]

### Description

Define a safe plugin SDK for evaluation hooks and rubrics so 3rd-party evaluators can be used.

### Sub-tasks

- Design plugin SDK interface
- Implement plugin registry and loader
- Add manifest validation and security checks
- Create example plugin package
- Document plugin API and lifecycle

### Suggested files

`src/plugins/registry.js`, `src/plugins/loader.js`, `src/plugins/api.js`, `docs/plugins.md`, `examples/plugin-example/`

### Acceptance

- Plugin can be registered and loaded safely
- Processor calls plugin lifecycle hooks (pre, eval, post)
- Example plugin runs and produces valid output
- Plugin isolation enforced

### Dependencies

- **depends_on**: None
- **depended_by**: None

### Additional notes

Use sandboxing approach (vm2 or similar) for plugin isolation. Require explicit manifest declaring hook names and rubric IDs. Whitelist available APIs.

---

## 9. Security hardening & sandboxing [P0][M]

### Description

Default secure container runtime: seccomp/AppArmor, user namespaces, drop capabilities, read-only FS, and time/resource isolation.

### Sub-tasks

- Create secure container profiles (seccomp, AppArmor)
- Implement user namespace mapping
- Drop unnecessary Linux capabilities
- Configure read-only filesystems where appropriate
- Integrate security options into container start

### Suggested files

`src/core/docker/security.js`, `src/security/profiles/`, config defaults, update container start code

### Acceptance

- Containers start unprivileged with restrictive policies
- Security profiles documented and configurable
- All major attack vectors mitigated
- Tests verify security posture

### Dependencies

- **depends_on**: #2 (Refactored docker wrappers)
- **depended_by**: #11 (Kubernetes executor), #17 (Live container management)

### Additional notes

Provide default secure profile and allow custom profiles via config. Document security tradeoffs. Test with common attack vectors.

---

## 10. Resource quotas, cgroups and enforcement [P0][M]

### Description

Enforce CPU/memory/io/time limits, and surface standardized failure codes when limits are hit.

### Sub-tasks

- Implement resource limit tracking
- Enforce CPU/memory/IO limits at container level
- Implement graceful termination when limits exceeded
- Add standardized failure codes for limit violations
- Surface limit violations in result metadata

### Suggested files

`src/core/limits.js`, `src/core/docker/resources.js`, integrate with container creation and monitoring

### Acceptance

- Limits enforced and respected
- Violations reported in result metadata with standard codes
- Containers terminate gracefully
- Operators can configure per-problem limits

### Dependencies

- **depends_on**: #2 (Refactored docker wrappers)
- **depended_by**: #11 (Kubernetes executor), #17 (Live container management)

### Additional notes

Use Docker resource limits + cgroup monitoring. Define standard verdict codes (OOM_KILLED, TIMEOUT, CPU_LIMIT_EXCEEDED). Provide clear diagnostic info.

---

## 11. Kubernetes executor & operator plan [P2][XL]

### Description

Provide an alternative executor that runs evaluations as Kubernetes Jobs or via a small operator; include Helm chart.

### Sub-tasks

- Design k8s executor abstraction
- Implement Kubernetes Job executor
- Create Helm chart for judgehost deployment
- Document k8s deployment and operator setup
- Provide example configurations

### Suggested files

`src/executors/k8s.js`, `charts/judgehost/`, `docs/k8s_deploy.md`, config for k8s backend

### Acceptance

- Helm chart deployable and functional
- Evaluations can run as k8s Jobs
- Multi-node scaling enabled
- Operator guide complete

### Dependencies

- **depends_on**: #2 (Docker wrappers), #9 (Security hardening), #10 (Resource quotas)
- **depended_by**: None

### Additional notes

Support both Docker and Kubernetes as execution backends. k8s backend optional and opt-in via config. Include resource requests/limits in Helm templates.

---

## 12. Artifact lifecycle & garbage collection [P1][S]

### Description

Background GC for artifacts and images, with policies (age, size, per-tenant quotas) and dry-run mode.

### Sub-tasks

- Implement GC policies (age, size, per-tenant quotas)
- Add dry-run mode for preview
- Create background GC scheduler
- Implement manual GC trigger via API/CLI
- Add observability for GC operations

### Suggested files

`src/maintenance/gc.js`, `src/maintenance/policies.js`, `scripts/gc-artifacts.js`, `src/queue/gc-scheduler.js`

### Acceptance

- GC runs produce predictable deletions
- Dry-run mode shows what would be deleted
- Policies enforceable and documented
- Metrics available for GC operations

### Dependencies

- **depends_on**: #7 (Pluggable artifact storage)
- **depended_by**: None

### Additional notes

Make GC policies configurable per-problem and per-tenant. Implement safeties to prevent accidental deletion (require explicit flag). Log all GC operations.

---

## 13. Webhook delivery, retries and DLQ [P1][S]

### Description

Robust webhook delivery with retry/backoff/jitter and DLQ for failed deliveries.

### Sub-tasks

- Implement exponential backoff with jitter
- Add retry limits and deadletter exchange
- Create DLQ consumer and inspection API
- Add observability for webhook deliveries
- Implement manual reprocessing of DLQ messages

### Suggested files

`src/utils/webhook.js`, `src/utils/backoff.js`, `src/queue/webhook-dlq.js`, middleware for webhook status tracking

### Acceptance

- Failed deliveries retried with backoff
- DLQ messages viewable and reprocessable
- Webhook delivery metrics available
- Dead letters never silently lost

### Dependencies

- **depends_on**: #3 (RabbitMQ integration)
- **depended_by**: None

### Additional notes

Use exponential backoff formula: min(max_delay, base_delay \* 2^attempt + jitter). Track delivery attempts and statuses. Provide API to inspect and reprocess DLQ.

---

## 14. Submission deduplication, caching & incremental evaluation [P2][M]

### Description

Hash submissions for deduplication; cache evaluation artifacts to avoid repeated work and support incremental evaluation when safe.

### Sub-tasks

- Implement submission hashing (SHA256)
- Add cache backend interface (local, Redis)
- Cache evaluation results and artifacts
- Support incremental re-evaluation on config changes
- Document cache invalidation strategy

### Suggested files

`src/cache/index.js`, `src/cache/local.js`, `src/cache/redis.js`, integrate with `processor.prepareSubmission`

### Acceptance

- Duplicate submissions use cached results or short-circuit
- Cache behavior documented
- Incremental evaluation works correctly
- Cache can be cleared/invalidated

### Dependencies

- **depends_on**: None
- **depended_by**: None

### Additional notes

Cache key should include problem_id + submission content hash. Document when cache is invalid (config change, image update). Provide cache stats endpoint.

---

## 15. Image lifecycle, signing & vulnerability scanning [P2][M]

### Description

Integrate Trivy/Clair scanning, optionally block unscanned images, and record scan findings in metadata.

### Sub-tasks

- Integrate Trivy vulnerability scanner
- Implement image signing and verification
- Add scan results to evaluation metadata
- Optionally enforce scan pass/fail gates
- Create image policy enforcement

### Suggested files

`src/security/image-scan.js`, `src/security/image-policy.js`, `scripts/scan-images.sh`, integrate with problem registration

### Acceptance

- Scans run automatically on image build
- Findings recorded in metadata
- Operator can opt-in to enforcement
- Scan results viewable and actionable

### Dependencies

- **depends_on**: #2 (Docker wrappers)
- **depended_by**: None

### Additional notes

Use Trivy for scanning (lightweight, no external service needed). Allow policy configuration (fail on HIGH+, ignore certain CVEs). Cache scan results.

---

## 16. Audit logging, provenance and reproducibility [P1][M]

### Description

Immutable audit logging for submissions, evaluations, container runs and config changes.

### Sub-tasks

- Implement immutable audit log recorder
- Add provenance metadata tracking
- Record all metadata for reproducibility
- Create audit log export functionality

### Suggested files

`src/audit/logger.js`, `docs/reproducibility.md`

### Acceptance

- Audit logs exportable and contain reproducibility metadata
- Container provenance tracked and verifiable
- Evaluation can be reproduced with audit information

### Dependencies

- **depends_on**: #1 (Logging & metrics)
- **depended_by**: None

### Additional notes

Focus on capturing all inputs, environment variables, and configuration necessary to reproduce an evaluation.

---

## 17. Live container management [P0][L]

### Description

Manage long-running service containers with reverse proxy for external access, robust lifecycle management, and health monitoring.

### Sub-tasks

- Implement reverse proxy with Traefik or Nginx for external access
- Create container lifecycle management for long-running services
- Implement network security and access controls
- Add health monitoring and auto-recovery for live services
- Provide external access URL generation and access control

### Suggested files

`src/services/proxy.js`, `src/services/lifecycle.js`, `src/services/health.js`, `src/core/docker/networks-exposed.js`, `src/config/proxy.js`

### Acceptance

- Live services are accessible via stable URLs
- Network isolation between containers enforced
- Health monitoring detects and recovers failed services
- Access controls limit external access to authorized users
- Resource limits respected for long-running containers

### Dependencies

- **depends_on**: #2 (Docker refactor), #9 (Security hardening), #10 (Resource quotas)
- **depended_by**: None

### Additional notes

Use Docker networks for isolation. Implement a service discovery mechanism to track live containers. Consider using Traefik for dynamic reverse proxy configuration based on container labels.

---

## Implementation sequencing for 1-month, 2-person delivery

### Phase 1: Foundation & Quality (Week 1)

**P0 Items - Must Complete:**

- #1: Prometheus-compatible logging & metrics [P0][S] ~2 days
- #5: Tests, CI and migration notes [P0][M] ~3 days (partial: CI setup, basic tests)
- #6: Docs & rollout plan [P0][S] ~1 day

**Total Phase 1: ~6 days → 3 person-weeks**

### Phase 2: Core Reliability (Week 2-3)

**P0 Items - Must Complete:**

- #2: Refactor dockerode wrapper into modules [P0][M] ~3 days
- #3: RabbitMQ integration for job queueing [P0][M] ~3 days
- #9: Security hardening & sandboxing [P0][M] ~2 days
- #10: Resource quotas, cgroups and enforcement [P0][M] ~2 days
- #17: Live container management [P0][L] ~4 days

**Total Phase 2: ~14 days → 7 person-weeks**

### Phase 3: Observability & Resilience (Week 4)

**P1 Items - Important:**

- #4: Observability + distributed tracing [P1][M] ~2 days
- #13: Webhook delivery, retries and DLQ [P1][S] ~2 days
- #12: Artifact lifecycle & garbage collection [P1][S] ~2 days

**Total Phase 3: ~6 days → 3 person-weeks**

### Phase 4: Advanced Features (If time permits)

**P1 Items - If Time Permits:**

- #7: Pluggable artifact storage [P1][M] ~3 days (local + S3 minimal)
- #16: Audit logging, provenance and reproducibility [P1][M] ~2 days

**P2 Items - If Additional Time:**

- #14: Submission deduplication, caching [P2][M] ~1-2 days
- #15: Image lifecycle, signing & vulnerability scanning [P2][M] ~1-2 days

**Total Phase 4: ~9-11 days → 4.5-5.5 person-weeks**

---

## Timeline Summary

| Week      | P0 Focus             | P1 Focus     | Status                   |
| --------- | -------------------- | ------------ | ------------------------ |
| 1         | #1, #5, #6           | —            | Foundation + tests       |
| 2-3       | #2, #3, #9, #10, #17 | —            | Core reliability         |
| 4         | —                    | #4, #13, #12 | Observability + webhooks |
| Next      | —                    | #7, #16 + P2 | Storage + audit + cache  |
| **Total** | **22 days**          | **11+ days** | **4+ weeks / 2 people**  |

**Effort Breakdown:**

- P0 items: 22 person-days = 100% of 2 people for ~2.5 weeks (including Live container management)
- P1 items: 11 person-days = 100% of 2 people for ~0.75 weeks (if sequential)
- P2 items: 17 person-days = Defer to next release

**Recommendation**: Complete all P0 items in Weeks 1-3 (achievable but tight). Complete P1 items #4, #13, #12 in Week 4 (achievable if team is disciplined). Defer remaining P1 items (#7, #16) and all P2 items (#8, #11, #14, #15) to next release.
