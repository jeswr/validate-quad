import type * as RDF from '@rdfjs/types';
import type { Transform } from 'readable-stream';

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

export interface ValidatorOptions {
  /**
   * The serialization format the quads are destined for, as an N3.js-style
   * name or MIME type (Turtle, TriG, N-Triples, N-Quads, N3).
   * Omit it to validate against the abstract RDF dataset model.
   */
  format?: string;
  /** The RDF version to validate against (default `'1.2'`). */
  version?: RdfVersion;
  /** `true` (the default) runs all term checks, `false` none; an object selects them. */
  terms?: boolean | TermChecks;
}

export interface ValidationStreamOptions extends ValidatorOptions {
  /** `'error'` (the default) fails the stream; `'skip'` drops the quad and emits `invalid`. */
  onInvalid?: 'error' | 'skip';
}

/** The quad position in which an invalid term was found. */
export type QuadPosition = 'subject' | 'predicate' | 'object' | 'graph';

/** The error reported for an invalid quad. */
export class QuadValidationError extends Error {
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

/** Creates a validator for the given options; reuse it for many quads. */
export function createValidator(options?: ValidatorOptions): QuadValidator;

/** Validates a single quad, returning an error for an invalid quad and `null` otherwise. */
export function validateQuad(quad: RDF.BaseQuad, options?: ValidatorOptions): QuadValidationError | null;

/** Creates an object-mode stream that passes valid quads through. */
export function createValidationStream(options?: ValidationStreamOptions): Transform;

/** Checks whether the string is an absolute IRI as per RFC 3987. */
export function isValidIri(iri: string): boolean;
/** Checks whether the string is a well-formed BCP 47 language tag. */
export function isValidLanguageTag(tag: string): boolean;
/** Checks whether the string (without `_:`) is a valid blank node label. */
export function isValidBlankNodeLabel(label: string): boolean;
/** Checks whether the string is a valid base direction (`ltr` or `rtl`). */
export function isValidBaseDirection(direction: string): boolean;
/** Checks whether the value is in the lexical space of the datatype; unknown datatypes are accepted. */
export function isValidDatatypeValue(value: string, datatype: RDF.NamedNode): boolean;
