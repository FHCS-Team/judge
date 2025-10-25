# Problem Package Specification

This document defines the structure and requirements for problem packages in the FHCS judge system, supporting multi-container environments with build and evaluation stage separation.

## Overview

Problem packages are archives that contain everything needed to evaluate submissions. They support:

- **Multi-container environments** - Problems can use multiple interconnected containers
- **Build/Evaluation stage separation** - Dependencies are cached during build, evaluation runs isolated
- **Granular resource limits** - Per-stage, per-container resource controls, including memory, CPU, disk, and network

## Package Structure

```
problem-package/
├── config.json                                 # Problem configuration
├── containers/                                 # Container definitions
│   ├── <container_id>/                         # Per-container directory
|   |   ├── entrypoint.build.sh                 # Container entrypoint script (optional)
│   │   ├── entrypoint.eval.sh                  # Container entrypoint script for evaluation stage (required)
|   |   ├── config.json                         # Container configuration
│   │   ├── Dockerfile.build                    # Build stage Dockerfile (optional)
│   │   ├── Dockerfile.eval                     # Evaluation stage Dockerfile (required)
|   |   ├── submission/                         # Template submission for build stage (optional)
│   │   ├── hooks/                              # Lifecycle hooks
│   │   │   ├── pre/
|   |   |   |   ├── 01_setup.sh                 # Example scripts
|   |   |   |   └── 02_install.sh
│   │   │   ├── post/
|   |   |   |   ├── 01_eval_rubric1.sh
|   |   |   |   ├── 02_eval_rubric1.sh
|   |   |   |   └── 03_clean_up.sh
│   │   │   └── periodic/
|   |   |       └── 01_monitor.sh               # Example periodic script
│   │   ├── data/                               # Container-specific data (optional)
│   │   │   └── ...
│   │   └── ...                                 # Additional container resources
├── shared/                                     # Shared resources between containers (optional)
│   ├── hooks/
│   └── data/
└── .judge/                                     # judge metadata
```

## Notes

1. `config.json` may reference Dockerfile locations and build contexts relative to the package root

## Related Documentation

- [Problem schema](problem.schema.json)
