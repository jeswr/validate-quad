import type * as RDF from '@rdfjs/types';
import { DataFactory, StreamParser, StreamWriter } from 'n3';
import * as api from '@rdfjs/validate-quad';
import {
  assertQuad, createValidator, createValidationStream, validateQuad,
  type QuadValidationError, type QuadValidator, type ContentType, type ValidQuad,
} from '@rdfjs/validate-quad';

type Equals<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
function expectType<T extends true>(): T | undefined { return undefined; }

const { namedNode, literal, quad } = DataFactory;
const q = quad(namedNode('http://ex/s'), namedNode('http://ex/p'), literal('o'));
declare const input: RDF.Quad;

// Validators and streams
const validate: QuadValidator = createValidator({ format: 'text/turtle', version: '1.1', terms: { iris: true } });
const error: QuadValidationError | null = validate(q);
if (error)
  console.log(error.position, error.term?.termType, error.quad.subject.value);
validateQuad(q, { format: 'application/n-quads', version: '1.2', terms: false });
const format: ContentType = 'application/n-quads';
validateQuad(q, { format, version: '1.2-basic' });
new StreamParser().pipe(createValidationStream({ format: 'application/n-triples', version: '1.2', onInvalid: 'skip' }))
  .pipe(new StreamWriter({ format: 'N-Triples' }));

// Turtle in RDF 1.2: IRI or blank node subjects, IRI predicates, triple term objects, default graph only
function turtle12(quad: RDF.Quad) {
  assertQuad(quad, { format: 'text/turtle', version: '1.2' });
  expectType<Equals<typeof quad.subject, RDF.NamedNode | RDF.BlankNode>>();
  expectType<Equals<typeof quad.predicate, RDF.NamedNode>>();
  expectType<Equals<typeof quad.graph, RDF.DefaultGraph>>();
  if (quad.object.termType === 'Quad') {
    expectType<Equals<typeof quad.object.graph, RDF.DefaultGraph>>();
    expectType<Equals<typeof quad.object.subject, RDF.NamedNode | RDF.BlankNode>>();
  }
  // @ts-expect-error variables are excluded
  quad.object.termType === 'Variable';
}

// N-Quads in RDF 1.1: named graphs, no triple terms, no directional literals
function nquads11(quad: RDF.Quad) {
  assertQuad(quad, { format: 'application/n-quads', version: '1.1' });
  expectType<Equals<typeof quad.graph, RDF.DefaultGraph | RDF.NamedNode | RDF.BlankNode>>();
  // @ts-expect-error triple terms are excluded in RDF 1.1
  quad.object.termType === 'Quad';
  if (quad.object.termType === 'Literal')
    expectType<Equals<typeof quad.object.direction, '' | null | undefined>>();
}

// RDF 1.2 Basic: directional literals but no triple terms
function trig12basic(quad: RDF.Quad) {
  assertQuad(quad, { format: 'application/trig', version: '1.2-basic' });
  // @ts-expect-error triple terms are excluded in RDF 1.2 Basic
  quad.object.termType === 'Quad';
  if (quad.object.termType === 'Literal')
    expectType<Equals<typeof quad.object.direction, 'ltr' | 'rtl' | '' | null | undefined>>();
}

// N3: literals and variables anywhere, formulas as blank node graphs
function n3(quad: RDF.BaseQuad) {
  assertQuad(quad, { format: 'text/n3', version: '1.2' });
  expectType<Equals<typeof quad.graph, RDF.DefaultGraph | RDF.BlankNode>>();
  if (quad.predicate.termType === 'Literal' || quad.predicate.termType === 'Variable')
    console.log(quad.predicate.value);
}

// A generic format narrows to the union of what the formats allow
function anyFormat(quad: RDF.Quad, format: ContentType) {
  assertQuad(quad, { format, version: '1.2' });
  const narrowed: ValidQuad<ContentType, '1.2'> = quad;
  void narrowed;
}
void [turtle12, nquads11, trig12basic, n3, anyFormat, input];

// The runtime surface is exactly the four functions
const exhaustive: Record<keyof typeof api, true> =
  { assertQuad: true, createValidator: true, validateQuad: true, createValidationStream: true };
void exhaustive;

// @ts-expect-error format is required
createValidator({ version: '1.2' });
// @ts-expect-error version is required
validateQuad(q, { format: 'text/turtle' });
// @ts-expect-error options are required
createValidationStream();
// @ts-expect-error format names are not content types
createValidator({ format: 'Turtle', version: '1.2' });
// @ts-expect-error unknown version
createValidator({ format: 'text/turtle', version: '1.3' });
// @ts-expect-error unknown onInvalid value
createValidationStream({ format: 'text/turtle', version: '1.2', onInvalid: 'warn' });
