 ## Important note for code generation

- Use `utils/logger.js` for logging instead of `console.log`.
- Generate unit tests for `./src/**/*.js` to `./tests/unit/**/*.test.js` using `jest`
- Generate integration tests for `./src/**/*.js` to `./tests/integration/**/*.test.js` using `jest`
- Tests are organized by group (for example, tests of a same function are grouped in a describe block)
- When using env variable: use `process.env.VAR_NAME`; check if it exists in `.env.example`; if not, update accordingly.

## Note when executing commands

- Respect and prioritize `package.json` scripts: npm test, npm start, npm run dev, etc.
