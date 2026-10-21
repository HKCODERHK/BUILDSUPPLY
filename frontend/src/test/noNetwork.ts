// A unit test must never talk to the network — least of all the live
// database. Any fetch from a test fails loudly instead of going out.
globalThis.fetch = () => {
  throw new Error('Unit tests must not make network requests')
}
