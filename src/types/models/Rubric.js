/**
 * Rubric types defined in documentation
 * TODO: add more rubric types
 */
const RubricTypes = {
  /**
   * Algorithmic test cases
   */
  TEST_CASES: "test_cases",
  /**
   * RESTful & GraphQL API endpoints
   */
  API_ENDPOINTS: "api_endpoints",
  PERFORMANCE_BENCHMARK: "performance_benchmark",
  /**
   * Static code analysis and quality checks
   */
  CODE_QUALITY: "code_quality",
  /**
   * UI/UX tests
   */
  UI_TESTS: "ui_tests",
  CUSTOM: "custom",
};

// TODO: define Rubric structure, refer to documentation
const Rubric = {};

// TODO: implement validation logic
const isValidRubric = (rubric) => {};

export { Rubric, RubricTypes, isValidRubric };
