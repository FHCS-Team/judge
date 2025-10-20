const axios = require("axios");

jest.mock("axios");

describe("DOMserver client", () => {
  let domserver;
  let mockRequest;
  beforeEach(() => {
    // Ensure a fresh module registry so domserver will pick up our axios mock
    jest.resetModules();

    mockRequest = jest
      .fn()
      .mockResolvedValue({ data: { data: { result_id: "mocked" } } });

    // Re-require axios from the mocked module and configure create() to
    // return a callable client function with .post and .interceptors
    const mockedAxios = require("axios");
    mockedAxios.create = jest.fn();

    const clientFunc = (...args) => mockRequest(...args);
    clientFunc.request = mockRequest;
    clientFunc.post = (...args) =>
      mockRequest({ method: "post", url: args[0], data: args[1] });
    clientFunc.interceptors = {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    };

    mockedAxios.create.mockReturnValue(clientFunc);

    // Now require domserver which will import the mocked axios
    domserver = require("../src/utils/domserver");
  });

  it("should send a POST request to DOMserver", async () => {
    const result = {
      submission_id: "sub_testid",
      problem_id: "prob1",
      status: "completed",
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      rubrics: [],
      error: null,
    };

    await domserver.submitResult(result);

    expect(mockRequest).toHaveBeenCalled();
    const call = mockRequest.mock.calls[0][0];
    expect(call.method).toBe("post");
    expect(call.url).toMatch(/add-judging-run/);
    expect(call.data).toBeDefined();
  });

  it("should send a POST request with correct method, url, and payload", async () => {
    // Arrange
    const fakeResult = {
      submission_id: "sub_test123",
      problem_id: "prob1",
      status: "completed",
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      rubrics: [],
      error: null,
    };
    axios.mockResolvedValue({ data: { data: { result_id: "result123" } } });

    // Act
    await domserver.submitResult(fakeResult);

    // Assert: the underlying mockRequest should have been called with POST payload
    expect(mockRequest).toHaveBeenCalled();
    const call2 = mockRequest.mock.calls[0][0];
    expect(call2.method).toBe("post");
    expect(call2.url).toMatch(/add-judging-run/);
    expect(call2.data).toBeDefined();
    expect(call2.data.submission_id).toBe("sub_test123");
  });
});
