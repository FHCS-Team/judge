# Internal filesystem of a container — enforced `/workspace` layout

## Build stage

| Dir                     | Mode | Mounted from                                                  | Content                                                                                                                                                              |
| :---------------------- | :--: | :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/workspace`            |  RW  | N/A                                                           | Entrypoint working directory — Problem `config.json` is copied into this dir                                                                                         |
| `/workspace/problem`    |  RO  | `${DATA_DIR}/problems/{problem_id}/containers/{container_id}` | Container-specific files mounted from the problem package for this container (contains the container entrypoint, tests, and any container-local `hooks/` or `data/`) |
| `/workspace/submission` |  RO  | `${DATA_DIR}/problems/{problem_id}/{container_id}/submission` | Submission package: the runtime first uses the template submission from the problem package to run the build stage (e.g. download/setup dependencies)                |
| `/workspace/hooks`      |  RO  | N/A                                                           | Local directory copied from the problem package's `hooks/` (read-only inside the container)                                                                          |
| `/workspace/data`       |  RO  | N/A                                                           | Local directory copied from the problem package's `data/` (read-only inside the container)                                                                           |
| `/workspace/tmp`        |  RW  | N/A                                                           | Actual working directory used for evaluation; the runtime copies the submission here before running tests                                                            |
| `/workspace/artifacts`  |  RW  | `${DATA_DIR}/artifacts/{submission_id}`                       | Mounted host volume `${DATA_DIR}/artifacts/{submission_id}`; should contain `logs/` and `rubrics/` subdirectories                                                    |
| `/workspace/shared`     |  RO  | `${DATA_DIR}/problems/{problem_id}/shared`                    | Shared files between containers from the problem package's `shared/` directory (contains shared `hooks/` and `data/`)                                                |
| `/workspace/{dir_name}` |  RW  | N/A                                                           | Additional directories specified in the problem/container configuration to be mounted inside the container (e.g. for caching dependencies)                           |

## Evaluation stage

| Dir                     | Mode | Mounted from                                                  | Content                                                                                                                                                                |
| :---------------------- | :--: | :------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/workspace`            |  RW  | N/A                                                           | Entrypoint working directory — Problem `config.json` is copied into this dir                                                                                           |
| `/workspace/problem`    |  RO  | `${DATA_DIR}/problems/{problem_id}/containers/{container_id}` | Container-specific files mounted from the problem package for this container (contains the container entrypoint, tests, and any container-local `hooks/` or `data/`)   |
| `/workspace/submission` |  RO  | `${DATA_DIR}/submissions/{problem_id}/{submission_id}`        | Submission package actual submission from `${DATA_DIR}/submissions/{problem_id}/{submission_id}` is loaded/overrides the template for the evaluation stage (read-only) |
| `/workspace/hooks`      |  RO  | N/A                                                           | Local directory copied from the problem package's `hooks/` (read-only inside the container)                                                                            |
| `/workspace/data`       |  RO  | N/A                                                           | Local directory copied from the problem package's `data/` (read-only inside the container)                                                                             |
| `/workspace/tmp`        |  RW  | N/A                                                           | Actual working directory used for evaluation; the runtime copies the submission here before running tests                                                              |
| `/workspace/artifacts`  |  RW  | `${DATA_DIR}/artifacts/{submission_id}`                       | Mounted host volume `${DATA_DIR}/artifacts/{submission_id}`; should contain `logs/` and `rubrics/` subdirectories                                                      |
| `/workspace/shared`     |  RO  | `${DATA_DIR}/problems/{problem_id}/shared`                    | Shared files between containers from the problem package's `shared/` directory (contains shared `hooks/` and `data/`)                                                  |
| `/workspace/{dir_name}` |  RW  | N/A                                                           | Additional directories specified in the problem/container configuration to be mounted inside the container (e.g. for caching dependencies)                             |

# Notes

1. Additional mounts must be specified in container `config.json`
   Structure:

```json
{
  "additional_mounts": [
    {
      "path": "path/", // relative to problem package root (required)
      "shared": true, // whether to share this mount between all same containers, for RO mounts only (optional, default: false)
      "container_path": "/workspace/path", // path inside container (optional, default: /workspace/{path}), error if conflicts with existing mount
      "mode": "rw" // "ro" or "rw" (optional, default: "ro"). If "shared" is true, this option is ignored and forced to "ro"
    }
  ]
}
```

Example use case: caching dependency downloads between build/evaluation stages and between multiple containers of the same type.

```json
{
  "additional_mounts": [
    {
      "path": "shared/data/cache",
      "shared": true, // all submissions share the same cache
      "container_path": "/workspace/cache"
    }
  ]
}
```

2. During build, the runtime mounts the package's submission/ (if present) into each container at that container's mount_submission_at (or /workspace/submission by default). During evaluation the runtime mounts the actual submission package from ${DATA_DIR}/submissions/{problem_id}/{submission_id} to the same path, overriding the template."

3. Rubric runners/tests should write their output JSON files into /workspace/artifacts/rubrics/. The expected filenames are found in config.json under each rubric's output_file.

4.
