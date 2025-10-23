## Problem

A collection of specifications represented as a problem package, which contains **configuration**, **hooks**, **resources** and literally everything.

## Submission

A submission is a collection of files submitted by a team for evaluation against a problem. Submissions can be freely structured, as long as they conform to the problem's requirements.

## Hook

Hooks are shell scripts that are executed at specific points (**pre**, **post**, or **periodic**) during the evaluation lifecycle, via `docker exec`. Hooks can be used to trigger tools within the evaluation environment, such as linters, static analyzers, or can even be used to evaluate the submission itself.

## Resource

Resources are files included in the problem package, which can be either container-specific or shared among multiple containers. They can be used to provide necessary data, libraries, or tools required for building or evaluating submissions.

## Container

A container is an isolated environment defined within the problem package, which can have its own build and evaluation stages, hooks, and resources. Containers can interact with each other as defined in the problem configuration, allowing for complex multi-container setups.

## Evaluation Instance

An evaluation instance is a running set of containers created for a specific submission. Each evaluation instance is isolated and has its own configurations (resource limits, volumes) as defined in the problem package.
