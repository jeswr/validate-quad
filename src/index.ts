import type * as RDF from '@rdfjs/types';
import { validateIri, IriValidationStrategy } from 'validate-iri';
import { parse as parseLanguageTag } from 'bcp-47';
import { validators as datatypeValidators } from 'rdf-validate-datatype';
import { Transform } from 'readable-stream';
import type { EventEmitter } from 'node:events';

/** An RDF content type that quads can be validated against. */
export type ContentType =
  | 'text/turtle'
  | 'application/trig'
  | 'application/n-triples'
  | 'application/n-quads'
  | 'text/n3';

/** The RDF version that quads must conform to. */
export type RdfVersion = '1.1' | '1.2-basic' | '1.2';

/** The term well-formedness checks to run (all of them by default). */
export interface TermChecks {
  /** IRIs (including datatype IRIs) must be absolute and valid as per RFC 3987. */
  iris?: boolean;
  /** Blank node values must be valid `BLANK_NODE_LABEL`s. */
  blankNodeLabels?: boolean;
  /** Language tags must be well-formed BCP 47. */
  languageTags?: boolean;
  /** Literal values must be valid Unicode and in the lexical space of their datatype. */
  datatypes?: boolean;
}

export interface ValidatorOptions<F extends ContentType = ContentType, V extends RdfVersion = RdfVersion> {
  /** The content type of the serialization the quads are destined for. */
  format: F;
  /** The RDF version to validate against. */
  version: V;
  /** `true` (the default) runs all term checks, `false` none; an object selects them. */
  terms?: boolean | TermChecks;
}

export interface ValidationStreamOptions<F extends ContentType = ContentType, V extends RdfVersion = RdfVersion>
  extends ValidatorOptions<F, V> {
  /** `'error'` (the default) fails the stream; `'skip'` drops the quad and emits `invalid`. */
  onInvalid?: 'error' | 'skip';
}

/** The quad position in which an invalid term was found. */
export type QuadPosition = 'subject' | 'predicate' | 'object' | 'graph';

/** The error reported for an invalid quad. */
export interface QuadValidationError extends Error {
  name: 'QuadValidationError';
  /** The quad that was validated. */
  quad: RDF.BaseQuad;
  /** The position of the offending term (inside a triple term, its position there). */
  position: QuadPosition | null;
  /** The offending term. */
  term: RDF.Term | undefined;
}

/** A function that validates quads, returning an error for an invalid quad and `null` otherwise. */
export type QuadValidator = (quad: RDF.BaseQuad) => QuadValidationError | null;

/** A literal that is valid in the given RDF version (no base direction in RDF 1.1). */
export type ValidLiteral<V extends RdfVersion> =
  V extends '1.1' ? RDF.Literal & { direction?: '' | null } : RDF.Literal;

// Whether a content type is Notation3 or has named graphs
type IsN3<F extends ContentType> = F extends 'text/n3' ? true : false;
type HasGraphs<F extends ContentType> = F extends 'application/trig' | 'application/n-quads' ? true : false;

/** A term that can appear as subject, predicate or object in N3. */
type N3Term<F extends ContentType, V extends RdfVersion> =
  | RDF.NamedNode | RDF.BlankNode | ValidLiteral<V> | RDF.Variable | ValidTripleTerm<F, V>;

/** The terms that can be the subject of a valid quad. */
export type ValidSubject<F extends ContentType, V extends RdfVersion> =
  IsN3<F> extends true ? N3Term<F, V> : RDF.NamedNode | RDF.BlankNode;

/** The terms that can be the predicate of a valid quad. */
export type ValidPredicate<F extends ContentType, V extends RdfVersion> =
  IsN3<F> extends true ? N3Term<F, V> : RDF.NamedNode;

/** The terms that can be the object of a valid quad. */
export type ValidObject<F extends ContentType, V extends RdfVersion> =
  IsN3<F> extends true ? N3Term<F, V> :
    RDF.NamedNode | RDF.BlankNode | ValidLiteral<V> | ValidTripleTerm<F, V>;

/** The terms that can be the graph of a valid quad. */
export type ValidGraph<F extends ContentType> =
  IsN3<F> extends true ? RDF.DefaultGraph | RDF.BlankNode :
    HasGraphs<F> extends true ? RDF.DefaultGraph | RDF.NamedNode | RDF.BlankNode : RDF.DefaultGraph;

/** A triple term that is valid inside a valid quad (only RDF 1.2 has them). */
export type ValidTripleTerm<F extends ContentType, V extends RdfVersion> =
  V extends '1.2' ? ValidTriple<F, V> : never;

/** A triple, as found inside a triple term: a quad in the default graph. */
export interface ValidTriple<F extends ContentType, V extends RdfVersion> extends RDF.BaseQuad {
  termType: 'Quad';
  subject: ValidSubject<F, V>;
  predicate: ValidPredicate<F, V>;
  object: ValidObject<F, V>;
  graph: RDF.DefaultGraph;
}

/**
 * The validation stream: a Node.js object-mode Transform that is also an
 * RDF/JS Stream and Sink, typed with the quads that pass validation.
 */
export interface ValidationStream<F extends ContentType = ContentType, V extends RdfVersion = RdfVersion>
  // Structurally an RDF.Stream<ValidQuad<F, V>> and an RDF.Sink; extending those
  // directly conflicts with the event emitter typings of Transform
  extends Transform {
  /** Pulls the next valid quad, or null if none is buffered. */
  read(size?: number): ValidQuad<F, V> | null;
  /** Consumes an RDF/JS stream of quads, returning this stream of valid quads. */
  import(stream: EventEmitter): this;
  [Symbol.asyncIterator](): AsyncIteratorObject<ValidQuad<F, V>, undefined, unknown>;
  on(event: 'data', listener: (quad: ValidQuad<F, V>) => void): this;
  on(event: 'invalid', listener: (error: QuadValidationError) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches the Transform signature
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once(event: 'data', listener: (quad: ValidQuad<F, V>) => void): this;
  once(event: 'invalid', listener: (error: QuadValidationError) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches the Transform signature
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  addListener(event: 'data', listener: (quad: ValidQuad<F, V>) => void): this;
  addListener(event: 'invalid', listener: (error: QuadValidationError) => void): this;
  addListener(event: 'error', listener: (error: Error) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches the Transform signature
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;
}

/** A quad that is valid for the given content type and RDF version. */
export interface ValidQuad<F extends ContentType, V extends RdfVersion> extends RDF.BaseQuad {
  subject: ValidSubject<F, V>;
  predicate: ValidPredicate<F, V>;
  object: ValidObject<F, V>;
  graph: ValidGraph<F>;
}

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const LANG_STRING = `${RDF_NS}langString`;
const DIR_LANG_STRING = `${RDF_NS}dirLangString`;

const VERSIONS: ReadonlySet<unknown> = new Set<RdfVersion>(['1.1', '1.2-basic', '1.2']);

// What each supported content type can represent
interface Profile { n3: boolean; graphs: boolean }
const PROFILES: Readonly<Record<ContentType, Profile>> = {
  'text/turtle': { n3: false, graphs: false },
  'application/trig': { n3: false, graphs: true },
  'application/n-triples': { n3: false, graphs: false },
  'application/n-quads': { n3: false, graphs: true },
  'text/n3': { n3: true, graphs: false },
};

// Blank node labels, following the `BLANK_NODE_LABEL` rule shared by
// Turtle, TriG, N-Triples and N-Quads (without the `_:` prefix)
const PN_CHARS_BASE = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF' +
  '\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F' +
  '\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const PN_CHARS_U = `${PN_CHARS_BASE}_`;
const PN_CHARS = `${PN_CHARS_U}\\-0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const BLANK_NODE_LABEL = new RegExp(
  `^[${PN_CHARS_U}0-9](?:[${PN_CHARS}.]*[${PN_CHARS}])?$`, 'u');

// Unpaired surrogates make a string invalid Unicode
const LONE_SURROGATE = /\p{Surrogate}/u;

// Results of the costlier checks are cached, since data repeats terms a lot
const CACHE_SIZE = 10000;
function cached(check: (value: string) => boolean): (value: string) => boolean {
  let cache = new Map<string, boolean>();
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

const isValidIri = cached(iri =>
  validateIri(iri, IriValidationStrategy.Strict) === undefined);

const isValidLanguageTag = cached(tag => {
  let valid = true;
  const schema = parseLanguageTag(tag, { warning() { valid = false; } });
  // Grandfathered tags are normalized to a language, and a bare `x` parses
  // without a warning, so a valid tag has a language or a private use part
  return valid && (Boolean(schema.language) || schema.privateuse.length > 0);
});

function isValidDatatypeValue(value: string, datatype: RDF.NamedNode): boolean {
  const validate = datatypeValidators.find(datatype);
  return !validate || validate(value);
}

class ValidationError extends Error implements QuadValidationError {
  declare name: 'QuadValidationError';

  constructor(
    message: string,
    public quad: RDF.BaseQuad,
    public position: QuadPosition | null,
    public term: RDF.Term | undefined,
  ) {
    super(message);
    this.name = 'QuadValidationError';
  }
}

// Determines what the target format can represent
function getProfile(format: unknown): Profile {
  if (typeof format !== 'string' || !Object.hasOwn(PROFILES, format))
    throw new Error(`Unsupported format: ${String(JSON.stringify(format))}; expected one of ${Object.keys(PROFILES).join(', ')}`);
  return PROFILES[format as ContentType];
}

// Resolves the `terms` option into individual checks
function getTermChecks(terms: unknown): Required<TermChecks> {
  const all = terms === undefined || terms === true;
  if (!all && terms !== false && (typeof terms !== 'object' || terms === null))
    throw new TypeError('Expected the terms option to be a boolean or an object');
  const selected = terms as TermChecks | false;
  const pick = (name: keyof TermChecks) => all || (!!selected && selected[name] === true);
  return {
    iris: pick('iris'),
    blankNodeLabels: pick('blankNodeLabels'),
    languageTags: pick('languageTags'),
    datatypes: pick('datatypes'),
  };
}

// Describes a term for use in error messages
function describe(term: RDF.Term): string {
  switch (term.termType) {
  case 'NamedNode': return `<${term.value}>`;
  case 'BlankNode': return `_:${term.value}`;
  case 'Literal': return JSON.stringify(term.value);
  case 'Variable': return `?${term.value}`;
  case 'DefaultGraph': return 'the default graph';
  case 'Quad': return 'a triple term';
  default: return `a term of type ${(term as RDF.Term).termType}`;
  }
}

type TermTypes = Readonly<Record<string, true>>;
const types = (...termTypes: string[]): TermTypes =>
  Object.fromEntries(termTypes.map(type => [type, true]));

/**
 * Creates a function that validates quads against the given options,
 * returning a `QuadValidationError` for an invalid quad and `null` otherwise.
 * Throws if the options are invalid.
 */
export function createValidator(options: ValidatorOptions): QuadValidator {
  if (typeof options !== 'object' || options === null)
    throw new TypeError('Expected an options object with a format and a version');
  const { n3, graphs } = getProfile(options.format);
  const version: unknown = options.version;
  if (!VERSIONS.has(version))
    throw new Error(`Unsupported RDF version: ${String(JSON.stringify(version))}; expected one of 1.1, 1.2-basic, 1.2`);
  const check = getTermChecks(options.terms);
  const tripleTerms = version === '1.2';
  const directions = version !== '1.1';
  const formatName = options.format;

  // Term types that each position allows, at the top level and inside triple terms
  const anyTerm = n3 ? types('NamedNode', 'BlankNode', 'Literal', 'Variable', 'Quad') : null;
  const subjects = anyTerm ?? types('NamedNode', 'BlankNode');
  const predicates = anyTerm ?? types('NamedNode');
  const objects = anyTerm ?? types('NamedNode', 'BlankNode', 'Literal', 'Quad');
  const graphTerms = n3 ? types('DefaultGraph', 'BlankNode') :
    graphs ? types('DefaultGraph', 'NamedNode', 'BlankNode') : types('DefaultGraph');
  const nestedGraphTerms = types('DefaultGraph');

  // Returns the reason why a term is invalid, or null
  function checkTerm(term: RDF.Term): string | null {
    switch (term.termType) {
    case 'NamedNode':
      return check.iris && !isValidIri(term.value) ?
        'it is not an absolute IRI as per RFC 3987' : null;
    case 'BlankNode':
      return check.blankNodeLabels && !BLANK_NODE_LABEL.test(term.value) ?
        'its label is not a valid blank node label' : null;
    case 'Literal':
      return checkLiteral(term);
    case 'Quad':
      return tripleTerms ? null : `triple terms are not part of RDF ${String(version)}`;
    default:
      return null;
    }
  }

  // Returns the reason why a literal is invalid, or null
  const literalChecks = check.iris || check.languageTags || check.datatypes;
  function checkLiteral(literal: RDF.Literal): string | null {
    // Only read what is needed, since literal getters can be costly
    if (!directions && literal.direction)
      return 'directional language-tagged strings are not part of RDF 1.1';
    if (!literalChecks)
      return null;
    const { value, language, direction } = literal;
    const datatype = literal.datatype as RDF.NamedNode | undefined;
    if (check.datatypes && LONE_SURROGATE.test(value))
      return 'its value is not a valid Unicode string';
    if (direction) {
      if (direction !== 'ltr' && direction !== 'rtl')
        return `its base direction "${String(direction)}" is not ltr or rtl`;
      if (!language)
        return 'it has a base direction but no language tag';
    }
    if (datatype?.termType !== 'NamedNode')
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
  function checkPosition(term: RDF.Term | undefined, position: QuadPosition, permitted: TermTypes,
    root: RDF.BaseQuad, nested: boolean): QuadValidationError | null {
    if (!term || typeof term.termType !== 'string')
      return new ValidationError(
        `Invalid quad: the ${position} is missing`, root, position, term);
    const { termType } = term;
    if (permitted[termType] !== true) {
      const where = nested ? `in a triple term in ${formatName}` : `in ${formatName}`;
      return new ValidationError(
        `Invalid ${position} ${describe(term)}: a ${termType} cannot be the ${position} ${where}`,
        root, position, term);
    }
    const reason = checkTerm(term);
    if (reason)
      return new ValidationError(
        `Invalid ${position} ${describe(term)}: ${reason}`, root, position, term);
    return termType === 'Quad' ? validate(term, root, true) : null;
  }

  // Returns an error for the first invalid term in the (possibly nested) quad
  function validate(quad: RDF.BaseQuad, root: RDF.BaseQuad, nested: boolean): QuadValidationError | null {
    if (!quad || typeof quad !== 'object')
      return new ValidationError(`Expected a quad, got ${String(quad)}`, root, null, quad);
    return checkPosition(quad.subject, 'subject', subjects, root, nested) ??
      checkPosition(quad.predicate, 'predicate', predicates, root, nested) ??
      checkPosition(quad.object, 'object', objects, root, nested) ??
      checkPosition(quad.graph, 'graph', nested ? nestedGraphTerms : graphTerms, root, nested);
  }

  return quad => validate(quad, quad, false);
}

// Validators for common option combinations are reused across calls
const validators = new Map<string, QuadValidator>();
function getValidator(options: ValidatorOptions): QuadValidator {
  // Only plain string and boolean options make a safe cache key
  const { format, version, terms } = options as Partial<ValidatorOptions> | null ?? {};
  if (typeof format !== 'string' || typeof version !== 'string' ||
      (terms !== undefined && typeof terms !== 'boolean'))
    return createValidator(options);
  const key = `${format} ${version} ${String(terms)}`;
  let validator = validators.get(key);
  if (!validator)
    validators.set(key, validator = createValidator(options));
  return validator;
}

/**
 * Validates a single quad, returning a `QuadValidationError` or `null`.
 * Throws if the options are invalid.
 */
export function validateQuad(quad: RDF.BaseQuad, options: ValidatorOptions): QuadValidationError | null {
  return getValidator(options)(quad);
}

/**
 * Asserts that a quad is valid for the given content type and RDF version,
 * throwing its `QuadValidationError` otherwise.
 * In TypeScript, the quad's terms are then narrowed to what that format and version allow.
 */
export function assertQuad<Q extends RDF.BaseQuad, F extends ContentType, V extends RdfVersion>(
  quad: Q, options: ValidatorOptions<F, V>): asserts quad is Q & ValidQuad<F, V> {
  const error = getValidator(options)(quad);
  if (error)
    throw error;
}

/**
 * Creates an object-mode stream that passes valid quads through.
 * Invalid quads cause an error (`onInvalid: 'error'`, the default)
 * or are dropped with an `invalid` event (`onInvalid: 'skip'`).
 * In TypeScript, the quads it emits are narrowed like those of `assertQuad`.
 */
export function createValidationStream<F extends ContentType, V extends RdfVersion>(
  options: ValidationStreamOptions<F, V>): ValidationStream<F, V> {
  const validate = createValidator(options);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const onInvalid: unknown = options.onInvalid === undefined ? 'error' : options.onInvalid;
  if (onInvalid !== 'error' && onInvalid !== 'skip')
    throw new Error(`Unsupported onInvalid option value: ${String(JSON.stringify(onInvalid))}; expected error or skip`);
  const stream = new Transform({
    objectMode: true,
    transform(quad: RDF.BaseQuad, _encoding, done) {
      const error = validate(quad);
      if (!error)
        return done(null, quad);
      if (onInvalid === 'error')
        return done(error);
      stream.emit('invalid', error);
      done();
    },
  }) as unknown as ValidationStream<F, V>;
  // Implement the RDF/JS Sink interface, as the N3.js parser and writer do
  stream.import = function (input: EventEmitter) {
    input.on('error', (error: unknown) => this.destroy(error as Error));
    if (typeof (input as Partial<NodeJS.ReadableStream>).pipe === 'function')
      (input as NodeJS.ReadableStream).pipe(this);
    else {
      input.on('data', (quad: RDF.BaseQuad) => this.write(quad));
      input.on('end', () => this.end());
    }
    return this;
  };
  return stream;
}
