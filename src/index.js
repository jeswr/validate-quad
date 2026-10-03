import { validateIri, IriValidationStrategy } from 'validate-iri';
import { parse as parseLanguageTag } from 'bcp-47';
import { validators as datatypeValidators } from 'rdf-validate-datatype';
import { Transform } from 'readable-stream';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const LANG_STRING = `${RDF}langString`;
const DIR_LANG_STRING = `${RDF}dirLangString`;

const VERSIONS = new Set(['1.1', '1.2-basic', '1.2']);

// Blank node labels, following the `BLANK_NODE_LABEL` rule shared by
// Turtle, TriG, N-Triples and N-Quads (without the `_:` prefix)
const PN_CHARS_BASE = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF' +
  '\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F' +
  '\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const PN_CHARS_U = `${PN_CHARS_BASE}_`;
const PN_CHARS = `${PN_CHARS_U}\\-0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
// (the classes deliberately contain combining characters and joiners)
const BLANK_NODE_LABEL = new RegExp(
  // eslint-disable-next-line no-misleading-character-class
  `^[${PN_CHARS_U}0-9](?:[${PN_CHARS}.]*[${PN_CHARS}])?$`, 'u');

// Unpaired surrogates make a string invalid Unicode
const LONE_SURROGATE = /\p{Surrogate}/u;

// Results of the costlier checks are cached, since data repeats terms a lot
const CACHE_SIZE = 10000;
function cached(check) {
  let cache = new Map();
  return value => {
    let result = cache.get(value);
    if (result === undefined) {
      if (cache.size >= CACHE_SIZE)
        cache = new Map();
      cache.set(value, result = check(value));
    }
    return result;
  };
}

/** Checks whether the string is an absolute IRI as per RFC 3987. */
export const isValidIri = cached(iri =>
  validateIri(iri, IriValidationStrategy.Strict) === undefined);

/** Checks whether the string is a well-formed BCP 47 language tag. */
export const isValidLanguageTag = cached(tag => {
  let valid = true;
  const schema = parseLanguageTag(tag, { warning() { valid = false; } });
  return valid && !!(schema.language || schema.privateuse.length ||
                     schema.irregular || schema.regular);
});

/** Checks whether the string (without `_:`) is a valid blank node label. */
export function isValidBlankNodeLabel(label) {
  return BLANK_NODE_LABEL.test(label);
}

/** Checks whether the string is a valid base direction. */
export function isValidBaseDirection(direction) {
  return direction === 'ltr' || direction === 'rtl';
}

/**
 * Checks whether the literal value is in the lexical space of its datatype,
 * using the rdf-validate-datatype registry; unknown datatypes are accepted.
 */
export function isValidDatatypeValue(value, datatype) {
  const validate = datatypeValidators.find(datatype);
  return !validate || validate(value);
}

/** The error reported for an invalid quad. */
export class QuadValidationError extends Error {
  constructor(message, quad, position, term) {
    super(message);
    this.name = 'QuadValidationError';
    this.quad = quad;
    this.position = position;
    this.term = term;
  }
}

// Determines what the target format can represent
function getProfile(format) {
  // Without a format, the target is an abstract RDF dataset
  if (format === undefined || format === null)
    return { n3: false, graphs: true };
  if (typeof format !== 'string')
    throw new TypeError(`Expected the format to be a string, got ${typeof format}`);
  const name = format.toLowerCase();
  if (/n3|notation3/.test(name))
    return { n3: true, graphs: false };
  if (/trig|quad/.test(name))
    return { n3: false, graphs: true };
  if (/turtle|triple/.test(name))
    return { n3: false, graphs: false };
  throw new Error(`Unknown format: ${format}`);
}

// Resolves the `terms` option into individual checks
function getTermChecks(terms) {
  const all = terms === undefined || terms === true;
  if (!all && terms !== false && (typeof terms !== 'object' || terms === null))
    throw new TypeError('Expected the terms option to be a boolean or an object');
  const pick = name => all || (!!terms && terms[name] === true);
  return {
    iris: pick('iris'),
    blankNodeLabels: pick('blankNodeLabels'),
    languageTags: pick('languageTags'),
    datatypes: pick('datatypes'),
  };
}

// Describes a term for use in error messages
function describe(term) {
  switch (term.termType) {
  case 'NamedNode': return `<${term.value}>`;
  case 'BlankNode': return `_:${term.value}`;
  case 'Literal': return JSON.stringify(term.value);
  case 'Variable': return `?${term.value}`;
  case 'DefaultGraph': return 'the default graph';
  case 'Quad': return 'a triple term';
  default: return `a term of type ${term.termType}`;
  }
}

/**
 * Creates a function that validates quads against the given options,
 * returning a `QuadValidationError` for an invalid quad and `null` otherwise.
 */
export function createValidator(options = {}) {
  const { n3, graphs } = getProfile(options.format);
  const version = options.version === undefined ? '1.2' : options.version;
  if (!VERSIONS.has(version))
    throw new Error(`Unknown RDF version: ${version}`);
  const check = getTermChecks(options.terms);
  const tripleTerms = version === '1.2';
  const directions = version !== '1.1';
  const formatName = options.format ? options.format : 'an RDF dataset';

  // Term types that each position allows, at the top level and inside triple terms
  const types = (...termTypes) => Object.fromEntries(termTypes.map(type => [type, true]));
  const anyTerm = n3 ? types('NamedNode', 'BlankNode', 'Literal', 'Variable', 'Quad') : null;
  const subjects = anyTerm || types('NamedNode', 'BlankNode');
  const predicates = anyTerm || types('NamedNode');
  const objects = anyTerm || types('NamedNode', 'BlankNode', 'Literal', 'Quad');
  const graphTerms = n3 ? types('DefaultGraph', 'BlankNode') :
    graphs ? types('DefaultGraph', 'NamedNode', 'BlankNode') : types('DefaultGraph');
  const nestedGraphTerms = types('DefaultGraph');

  // Returns the reason why a term is invalid, or null
  function checkTerm(term) {
    switch (term.termType) {
    case 'NamedNode':
      return check.iris && !isValidIri(term.value) ?
        'it is not an absolute IRI as per RFC 3987' : null;
    case 'BlankNode':
      return check.blankNodeLabels && !isValidBlankNodeLabel(term.value) ?
        'its label is not a valid blank node label' : null;
    case 'Literal':
      return checkLiteral(term);
    case 'Quad':
      return tripleTerms ? null : `triple terms are not part of RDF ${version}`;
    default:
      return null;
    }
  }

  // Returns the reason why a literal is invalid, or null
  const literalChecks = check.iris || check.languageTags || check.datatypes;
  function checkLiteral(literal) {
    // Only read what is needed, since literal getters can be costly
    if (!directions && literal.direction)
      return 'directional language-tagged strings are not part of RDF 1.1';
    if (!literalChecks)
      return null;
    const { value, language, direction, datatype } = literal;
    if (check.datatypes && LONE_SURROGATE.test(value))
      return 'its value is not a valid Unicode string';
    if (direction) {
      if (!isValidBaseDirection(direction))
        return `its base direction "${direction}" is not ltr or rtl`;
      if (!language)
        return 'it has a base direction but no language tag';
    }
    if (!datatype || datatype.termType !== 'NamedNode')
      return 'its datatype is not a named node';
    if (language) {
      if (check.languageTags && !isValidLanguageTag(language))
        return `its language tag "${language}" is not well-formed BCP 47`;
      const expected = direction ? DIR_LANG_STRING : LANG_STRING;
      if (datatype.value !== expected)
        return `its datatype must be <${expected}>`;
      return null;
    }
    if (datatype.value === LANG_STRING || datatype.value === DIR_LANG_STRING)
      return 'it has a language string datatype but no language tag';
    if (check.iris && !isValidIri(datatype.value))
      return 'its datatype is not an absolute IRI as per RFC 3987';
    if (check.datatypes && !isValidDatatypeValue(value, datatype))
      return `its value is not valid for datatype <${datatype.value}>`;
    return null;
  }

  // Returns an error if the term is not valid in the given position, or null
  function checkPosition(term, position, permitted, root, nested) {
    if (!term || typeof term.termType !== 'string')
      return new QuadValidationError(
        `Invalid quad: the ${position} is missing`, root, position, term);
    const { termType } = term;
    if (permitted[termType] !== true) {
      const where = nested ? `in a triple term in ${formatName}` : `in ${formatName}`;
      return new QuadValidationError(
        `Invalid ${position} ${describe(term)}: a ${termType} cannot be the ${position} ${where}`,
        root, position, term);
    }
    const reason = checkTerm(term);
    if (reason)
      return new QuadValidationError(
        `Invalid ${position} ${describe(term)}: ${reason}`, root, position, term);
    return termType === 'Quad' ? validate(term, root, true) : null;
  }

  // Returns an error for the first invalid term in the (possibly nested) quad
  function validate(quad, root, nested) {
    if (!quad || typeof quad !== 'object')
      return new QuadValidationError(`Expected a quad, got ${quad}`, root, null, quad);
    return checkPosition(quad.subject, 'subject', subjects, root, nested) ||
      checkPosition(quad.predicate, 'predicate', predicates, root, nested) ||
      checkPosition(quad.object, 'object', objects, root, nested) ||
      checkPosition(quad.graph, 'graph', nested ? nestedGraphTerms : graphTerms, root, nested);
  }

  return quad => validate(quad, quad, false);
}

/**
 * Validates a single quad, returning a `QuadValidationError` or `null`.
 * Use `createValidator` when validating many quads with the same options.
 */
export function validateQuad(quad, options) {
  return createValidator(options)(quad);
}

/**
 * Creates an object-mode stream that passes valid quads through.
 * Invalid quads cause an error (`onInvalid: 'error'`, the default)
 * or are dropped with an `invalid` event (`onInvalid: 'skip'`).
 */
export function createValidationStream(options = {}) {
  const validate = createValidator(options);
  const onInvalid = options.onInvalid === undefined ? 'error' : options.onInvalid;
  if (onInvalid !== 'error' && onInvalid !== 'skip')
    throw new Error(`Unknown onInvalid option value: ${onInvalid}`);
  const stream = new Transform({
    objectMode: true,
    transform(quad, encoding, done) {
      const error = validate(quad);
      if (!error)
        return done(null, quad);
      if (onInvalid === 'error')
        return done(error);
      stream.emit('invalid', error);
      done();
    },
  });
  return stream;
}
