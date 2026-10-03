import { DataFactory, StreamParser, StreamWriter } from 'n3';
import * as api from '@rdfjs/validate-quad';
import {
  createValidator, createValidationStream, validateQuad,
  type QuadValidationError, type QuadValidator, type ContentType,
} from '@rdfjs/validate-quad';

const { namedNode, literal, quad } = DataFactory;
const q = quad(namedNode('http://ex/s'), namedNode('http://ex/p'), literal('o'));

const validate: QuadValidator = createValidator({ format: 'text/turtle', version: '1.1', terms: { iris: true } });
const error: QuadValidationError | null = validate(q);
if (error)
  console.log(error.position, error.term?.termType, error.quad.subject.value);
validateQuad(q);
validateQuad(q, { terms: false });
const format: ContentType = 'application/n-quads';
validateQuad(q, { format });

new StreamParser().pipe(createValidationStream({ format: 'application/n-triples', onInvalid: 'skip' }))
  .pipe(new StreamWriter({ format: 'N-Triples' }));

// The runtime surface is exactly the three functions
const exported: (keyof typeof api)[] = ['createValidator', 'validateQuad', 'createValidationStream'];
const exhaustive: Record<keyof typeof api, true> = { createValidator: true, validateQuad: true, createValidationStream: true };
void exported; void exhaustive;

// @ts-expect-error format names are not content types
createValidator({ format: 'Turtle' });
// @ts-expect-error unsupported content type
createValidator({ format: 'application/rdf+xml' });
// @ts-expect-error unknown version
createValidator({ version: '1.3' });
// @ts-expect-error unknown onInvalid value
createValidationStream({ onInvalid: 'warn' });
