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
├── config.json                                 # Problem configuration (required)
├── containers/                                 # Container definitions (required)
│   ├── <container_id>/                         # Per-container directory
│   │   ├── Dockerfile.build                    # Build stage Dockerfile (required)
│   │   ├── Dockerfile.eval                     # Evaluation stage Dockerfile (optional)
│   │   ├── hooks/                              # Lifecycle hooks (optional)
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
│   │   └── ...                                 # Additional container resources (optional)
├── shared/                                     # Shared resources between containers (optional)
│   ├── hooks/
│   └── data/
└── .judge/                                     # judge metadata (optional)
```

## Related Documentation

- [Problem schema](problem.schema.json)
