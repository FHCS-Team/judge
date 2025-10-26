const fs = require("fs");
const path = require("path");
const os = require("os");
const stream = require("stream");

// Mock the axios client used by the Downloader
jest.mock("../../../src/config/axios");
const axios = require("../../../src/config/axios");

const {
  Downloader,
  download,
  upload,
  update,
} = require("../../../src/utils/downloader");

function makeTempDir(prefix = "judge-dl-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("Downloader utilities", () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = makeTempDir();
  });

  beforeEach(() => {
    // reset mocks per test
    axios.get = jest.fn();
    axios.post = jest.fn();
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
    jest.resetAllMocks();
  });

  test("download saves stream to file", async () => {
    const content = "streamed content";
    const pass = new stream.PassThrough();

    // Make axios.get return an object with data being a readable stream
    axios.get.mockResolvedValue({ data: pass });

    const outPath = path.join(tmpDir, "out.bin");
    const p = download("http://example.test/file", outPath);

    // write to stream asynchronously
    setTimeout(() => {
      pass.write(Buffer.from(content, "utf8"));
      pass.end();
    }, 10);

    const result = await p;
    expect(result).toBe(outPath);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath, "utf8")).toBe(content);
    expect(axios.get).toHaveBeenCalledWith("http://example.test/file", {
      responseType: "stream",
    });
  });

  test("download propagates download errors", async () => {
    axios.get.mockRejectedValue(new Error("network fail"));
    const outPath = path.join(tmpDir, "out2.bin");

    await expect(download("http://bad.url/file", outPath)).rejects.toThrow(
      "network fail",
    );
  });

  test("upload posts file stream and returns response data", async () => {
    // create a small file (use async write to be safe across environments)
    const filePath = path.join(tmpDir, "upload.txt");
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, "payload");
    // ensure file exists before proceeding
    await fs.promises.stat(filePath);

    // mock stat
    // axios.post should return { data: 'ok' }
    axios.post.mockResolvedValue({ data: { result: "ok" } });

    const result = await upload(filePath, "http://upload.test/put");
    expect(result).toEqual({ result: "ok" });

    // check axios.post called with stream-like second arg
    expect(axios.post).toHaveBeenCalled();
    const [url, data, opts] = axios.post.mock.calls[0];
    expect(url).toBe("http://upload.test/put");
    expect(typeof opts.headers["Content-Length"]).toBe("number");
    expect(opts.headers["Content-Type"]).toBe("application/octet-stream");
  });

  test("update writes file and creates dirs", async () => {
    const nestedPath = path.join(tmpDir, "a", "b", "c.txt");
    await update(nestedPath, "hello world");
    expect(fs.existsSync(nestedPath)).toBe(true);
    expect(fs.readFileSync(nestedPath, "utf8")).toBe("hello world");
  });

  test("download handles writer error and rejects", async () => {
    // axios returns a stream
    const pass = new stream.PassThrough();
    axios.get.mockResolvedValue({ data: pass });

    // mock createWriteStream to emit error
    const origCreate = fs.createWriteStream;
    fs.createWriteStream = jest.fn(() => {
      const w = new stream.PassThrough();
      process.nextTick(() => w.emit("error", new Error("write fail")));
      return w;
    });

    const outPath = path.join(tmpDir, "out-err.bin");
    await expect(download("http://example.test/file", outPath)).rejects.toThrow(
      "write fail",
    );

    // restore
    fs.createWriteStream = origCreate;
  });

  test("upload propagates axios.post rejection", async () => {
    const filePath = path.join(tmpDir, "upload2.txt");
    await fs.promises.writeFile(filePath, "p");
    axios.post.mockRejectedValue(new Error("upload fail"));

    // mock createReadStream so the stream doesn't emit errors later
    const origCreateRead = fs.createReadStream;
    fs.createReadStream = jest.fn(() => new stream.PassThrough());

    await expect(upload(filePath, "http://upload.test/bad")).rejects.toThrow(
      "upload fail",
    );

    // restore
    fs.createReadStream = origCreateRead;
  });
});
