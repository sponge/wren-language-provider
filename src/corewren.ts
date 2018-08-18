// this is just a fake class definition typed out from the docs so we can use core modules
const coreModules = `
class Class {
  name {}
  supertype {}
}

class Fiber {
  static abort(message) {}
  static current {}
  construct new(function) {}
  static suspend() {}
  static yield() {}
  static yield(value) {}

  call() {}
  call(value) {}
  error {}
  isDone {}
  try() {}
  transfer() {}
  transfer(value) {}
  transferError(error) {}
}

class Fn {
  construct new(function) {}

  arity {}
  call(args) {}
}

class List is Sequence {
  static filled(size, element) {}
  construct new() {}

  add(item) {}
  clear() {}
  count {}
  insert(index, item) {}
  removeAt(index) {}
}

class Map is Sequence {
  construct new() {}
  clear() {}
  containsKey(key) {}
  count {}
  keys {}
  remove(key) {}
  values {}
}

class Num {
  static fromString(value) {}
  static pi {}
  static largest {}
  static smallest {}

  abs {}
  acos {}
  asin {}
  atan {}
  atan(x) {}
  ceil {}
  cos {}
  floor {}
  isInfinity {}
  isInteger {}
  isNan {}
  log {}
  pow(power) {}
  round {}
  sin {}
  sqrt {}
  tan {}
}

class Object {
  static same(obj1, obj2) {}
}

class Sequence {
  all(predicate) {}
  any(predicate) {}
  contains(element) {}
  count {}
  count(predicate) {}
  each(function) {}
  isEmpty {}
  join(separator) {}
  join() {}
  map(transformation) {}
  reduce(function) {}
  reduce(seed, function) {}
  skip(count) {}
  take(count) {}
  toList {}
  where(predicate) {}
}

class String {
  static fromCodePoint(codePoint) {}
  bytes {}
  codePoints {}
  contains(other) {}
  count {}
  endsWith(suffix) {}
  indexOf(search) {}
  indexOf(search, start) {}
  replace(old, swap) {}
  split(separator) {}
  startsWith(prefix) {}
  trim() {}
  trim(chars) {}
  trimEnd() {}
  trimEnd(chars) {}
  trimStart() {}
  trimStart(chars) {}
}

class System {
  static clock {}
  static gc() {}
  static print() {}
  static print(object) {}
  static printAll(sequence) {}
  static write(object) {}
}
`;

export { coreModules };