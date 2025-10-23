# Implementation status

| Project Type                                  | Supported? | Description                                                                          |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| Web API                                       | ❌         | RESTful or GraphQL services that respond to HTTP requests.                           |
| Web Application                               | ❌         | Frontend or full-stack web applications with user interfaces.                        |
| CLI Tool                                      | ❌         | Command-line programs that read from stdin or files and write to stdout or files.    |
| Container Service                             | ❌         | Dockerized applications that run in isolated containers.                             |
| Mobile Application                            | ❌         | Mobile apps built with React Native, Flutter, or as Progressive Web Apps (PWAs).     |
| Desktop Application                           | ❌         | Desktop apps built with Electron, Tauri, or native frameworks.                       |
| Bot/Chatbot                                   | ❌         | Bots for platforms like Discord, Telegram, or Slack.                                 |
| Game                                          | ❌         | Web-based games using HTML5, Unity WebGL, or similar technologies.                   |
| Hardware/IoT Simulator                        | ❌         | Simulated IoT devices communicating over MQTT, WebSockets, or HTTP.                  |
| Machine Learning Model API                    | ❌         | APIs serving machine learning models for inference tasks.                            |
| Edge/Load Testing Service                     | ❌         | Services or scripts designed to generate traffic and measure performance under load. |
| Static Site / Documentation Generator         | ❌         | Tools that build static sites (Hugo, Jekyll, MkDocs).                                |
| Data Pipeline / ETL Job                       | ❌         | Batch processes that transform and move data between systems.                        |
| Analytics Dashboard / BI Job                  | ❌         | Aggregation/reporting jobs producing dashboards or CSV/JSON reports.                 |
| Streaming Service / Real-time Processor       | ❌         | Event-driven processors using Kafka, Kinesis, etc.                                   |
| Plugins / Extensions                          | ❌         | Editor/browser/CI plugins that extend host applications.                             |
| Infrastructure as Code / Deployment Templates | ❌         | Terraform, CloudFormation templates for infra provisioning.                          |
| Security Scanner / Static Analysis Tool       | ❌         | Tools that scan code or artifacts for security/policy issues.                        |
| CLI / REST Microservice with Plugins          | ❌         | Services that load sandboxed plugins or modules at runtime.                          |
| Multimedia Processing                         | ❌         | Image, audio, or video processing/transcoding jobs.                                  |
| Blockchain / Smart Contract DApp              | ❌         | Smart contracts and DApps interacting with a blockchain VM.                          |
| Accessibility / A11y Compliance Project       | ❌         | Projects focused on accessibility compliance.                                        |
| Brokered / Federated Systems                  | ❌         | Multi-service or federated systems coordinating across trust boundaries.             |
| Research Notebook / Reproducible Analysis     | ❌         | Jupyter notebooks or reproducible analyses with narrative and code.                  |
| Embedded / Firmware                           | ❌         | Firmware code targeting microcontrollers and embedded devices.                       |

# Strategy & failure modes

| Project Type                                  | Strategy                                                                                                                                                         | Failure modes                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Web API                                       | Planned: Run structured HTTP requests (unit, integration, fuzzing). Validate status codes, JSON schemas and business rules. Mock external dependencies in tests. | Flaky network, timeouts, auth flows, schema drift.                               |
| Web Application                               | Planned: Use headless browsers (Playwright, Puppeteer) for scripted user journeys; supplement with unit/component tests and visual regression as needed.         | Animation/timing, network assets, responsive differences; UI flakiness.          |
| CLI Tool                                      | Planned: Execute binary in an isolated container; provide stdin/files, capture stdout/stderr and exit codes; compare to golden outputs or property checks.       | Environment-specific behavior, locale/encoding, large I/O.                       |
| Container Service                             | Planned: Start containers with constrained resources and deterministic mounts; health checks, endpoint probes, and log inspection.                               | Nondeterministic startup timing, port conflicts, image differences.              |
| Mobile Application                            | Planned: Prefer PWAs; for native use emulators + Appium; focus on key flows.                                                                                     | Emulator variances, hardware acceleration, flaky UI.                             |
| Desktop Application                           | Planned: Test Electron/Tauri with browser automation; native apps may need OS-level automation; prefer CLI/API hooks when possible.                              | Window manager differences, scaling, permission dialogs.                         |
| Bot/Chatbot                                   | Planned: Simulate messages via platform APIs or protocol emulation; validate responses, timing and state.                                                        | Rate limits, OAuth flows, asynchronous processing.                               |
| Game                                          | Planned: Unit-test deterministic game logic; use input replays and state snapshots; visual/human grading for full gameplay.                                      | Nondeterministic physics, timing, heavy rendering.                               |
| Hardware/IoT Simulator                        | Planned: Provide virtual devices and replay recorded sensor streams; assert state changes and alerts.                                                            | Timing/concurrency and network partitioning.                                     |
| Machine Learning Model API                    | Planned: Use curated test sets and metrics (accuracy, F1); control randomness and record runtime constraints; prefer CPU-only grading when possible.             | Nondeterministic hardware, dataset leakage, performance variability.             |
| Edge/Load Testing Service                     | Planned: Run deterministic load profiles against instrumented endpoints; collect percentiles and error rates and compare to SLOs.                                | Noisy host load, shared network; host interference impacts metrics.              |
| Static Site / Documentation Generator         | Planned: Run static build in container, perform link-checks, HTML validation and linting; compare artifact trees.                                                | External asset fetching, CDN dependencies.                                       |
| Data Pipeline / ETL Job                       | Planned: Supply curated sample datasets, run pipeline, validate outputs using schema checks and row-level assertions.                                            | Long-running transforms, external connectors.                                    |
| Analytics Dashboard / BI Job                  | Planned: Evaluate underlying queries or exports rather than UI screenshots; compare numeric outputs to expected aggregates.                                      | Data freshness, caching, and sample variance.                                    |
| Streaming Service / Real-time Processor       | Planned: Spin up local broker, replay event streams, assert downstream outputs and aggregates.                                                                   | Ordering, timing, and stateful replay edge cases.                                |
| Plugins / Extensions                          | Planned: Require unit/integration tests that exercise the extension API; use host-mocks and headless integration where supported.                                | Host API changes and environment differences.                                    |
| Infrastructure as Code / Deployment Templates | Planned: Run plan in local/emulated env and run static policy/lint checks (tflint, checkov); avoid cloud apply.                                                  | Cloud provider differences, cost, eventual consistency.                          |
| Security Scanner / Static Analysis Tool       | Planned: Run scans and grade by counts/severity with pinned scanner versions and suppression rules.                                                              | False positives, scanner nondeterminism.                                         |
| CLI / REST Microservice with Plugins          | Planned: Run contract tests exercising plugin entry points inside a sandbox and validate outputs/logs.                                                           | Plugin sandbox escapes or incorrect sandboxing.                                  |
| Multimedia Processing                         | Planned: Run processing with pinned encoder settings; validate outputs with checksums, file properties and perceptual metrics.                                   | Encoder nondeterminism and platform codecs.                                      |
| Blockchain / Smart Contract DApp              | Planned: Use local test chains (ganache/hardhat) to run transactions and assert state/events; snapshot/rollback between tests.                                   | EVM differences, gas nondeterminism, toolchain version drift.                    |
| Accessibility / A11y Compliance Project       | Planned: Run automated accessibility audits (axe-core) and count violations; supplement with manual checks where needed.                                         | Dynamic content and context-sensitive rules that auto tools miss.                |
| Brokered / Federated Systems                  | Planned: Focus on contract/integration tests between service boundaries using mocked emulators; scope tests to critical contracts.                               | Full federation complexity and network topology; heavy to reproduce.             |
| Research Notebook / Reproducible Analysis     | Planned: Run notebooks in reproducible runners (nbconvert, papermill) with pinned environments and assert machine-readable outputs.                              | Hidden state, large datasets, and network I/O.                                   |
| Embedded / Firmware                           | Planned: Use emulators/QEMU-based boards and unit tests for hardware abstractions; hardware-in-loop is optional and resource-dependent.                          | Hardware variability and timing; physical fixtures required for full validation. |

# General heuristics

| Heuristic       | Description                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Determinism     | Favor test cases and environments that minimize external variability. Pin versions, seeds, locales, and timezones.             |
| Resource limits | Run untrusted submissions with CPU, memory, disk, and network quotas to prevent abuse and improve reproducibility.             |
| Isolation       | Sandbox submissions using containers, VMs, or language-specific sandboxes; minimize privileged operations.                     |
| Observability   | Collect stdout/stderr, structured logs, and artifact snapshots (files, DB dumps) to provide meaningful feedback to students.   |
| Gradation       | For non-deterministic outputs (ML, approximate algorithms), define scoring rubrics and thresholds rather than strict equality. |
