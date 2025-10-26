const errors = require("../../../src/utils/errors");
const filesystem = require("../../../src/utils/filesystem");
const parser = require("../../../src/utils/parser");
const persistence = require("../../../src/utils/persistence");

describe("Placeholder utils modules", () => {
  test("errors module exists and is an object (placeholder)", () => {
    expect(typeof errors).toBe("object");
    expect(Object.keys(errors).length).toBe(0);
  });

  test("filesystem module exists and is an object (placeholder)", () => {
    expect(typeof filesystem).toBe("object");
    expect(Object.keys(filesystem).length).toBe(0);
  });

  test("parser module exists and is an object (placeholder)", () => {
    expect(typeof parser).toBe("object");
    expect(Object.keys(parser).length).toBe(0);
  });

  test("persistence module exists and is an object (placeholder)", () => {
    expect(typeof persistence).toBe("object");
    expect(Object.keys(persistence).length).toBe(0);
  });
});
