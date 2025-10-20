// Composition (right to left)
const compose =
  (...fns) =>
  (arg) =>
    fns.reduceRight((acc, fn) => fn(acc), arg);

// Pipe (left to right)
const pipe =
  (...fns) =>
  (arg) =>
    fns.reduce((acc, fn) => fn(acc), arg);

// Curry
const curry = (fn) => {
  const arity = fn.length;
  return function curried(...args) {
    if (args.length >= arity) return fn(...args);
    return (...moreArgs) => curried(...args, ...moreArgs);
  };
};

// Memoize
const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

module.exports = {
  compose,
  pipe,
  curry,
  memoize,
};
