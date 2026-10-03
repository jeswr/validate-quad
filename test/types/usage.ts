import { DataFactory, StreamParser, StreamWriter } from 'n3';
import {
  createValidator, createValidationStream, validateQuad, QuadValidationError,
  isValidIri, type QuadValidator,
} from '@rdfjs/validate-quad';

const { namedNode, literal, quad } = DataFactory;
const q = quad(namedNode('http://ex/s'), namedNode('http://ex/p'), literal('o'));

const validate: QuadValidator = createValidator({ format: 'Turtle', version: '1.1', terms: { iris: true } });
const error: QuadValidationError | null = validate(q);
if (error)
  console.log(error.position, error.term?.termType, error.quad.subject.value);
validateQuad(q);
validateQuad(q, { terms: false });
const ok: boolean = isValidIri('http://ex/');

new StreamParser().pipe(createValidationStream({ format: 'N-Triples', onInvalid: 'skip' }))
  .pipe(new StreamWriter({ format: 'N-Triples' }));

// @ts-expect-error unknown version
createValidator({ version: '1.3' });
// @ts-expect-error unknown onInvalid value
createValidationStream({ onInvalid: 'warn' });
void ok;
