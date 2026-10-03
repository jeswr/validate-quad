import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DataFactory, StreamParser, StreamWriter } from 'n3';
import { createValidationStream } from '@rdfjs/validate-quad';

const { namedNode, literal, quad } = DataFactory;
const s = namedNode('http://ex.org/s');
const p = namedNode('http://ex.org/p');
const g = namedNode('http://ex.org/g');

function collect(stream) {
  return new Promise((resolve, reject) => {
    const items = [];
    stream.on('data', item => items.push(item));
    stream.on('error', reject);
    stream.on('end', () => resolve(items));
  });
}

function toString(stream) {
  return collect(stream).then(chunks => chunks.join(''));
}

describe('createValidationStream', () => {
  it('passes valid quads through', async () => {
    const quads = [quad(s, p, literal('a')), quad(s, p, literal('b'))];
    const output = await collect(Readable.from(quads).pipe(createValidationStream({ format: 'application/n-quads', version: '1.2' })));
    assert.deepEqual(output, quads);
  });

  it('emits an error for an invalid quad by default', async () => {
    const quads = [quad(s, p, literal('a')), quad(s, p, literal('b'), g)];
    const stream = createValidationStream({ format: 'text/turtle', version: '1.2' });
    const seen = [];
    stream.on('data', q => seen.push(q));
    await assert.rejects(pipeline(Readable.from(quads), stream), error => {
      assert.equal(error.name, 'QuadValidationError');
      assert.equal(error.position, 'graph');
      assert.equal(error.quad, quads[1]);
      return true;
    });
    assert.deepEqual(seen, [quads[0]]);
  });

  it('drops invalid quads and emits invalid events with onInvalid: skip', async () => {
    const quads = [quad(s, p, literal('a')), quad(s, literal('bad'), literal('b')), quad(s, p, literal('c'))];
    const stream = createValidationStream({ format: 'application/n-quads', version: '1.2', onInvalid: 'skip' });
    const invalid = [];
    stream.on('invalid', error => invalid.push(error));
    const output = await collect(Readable.from(quads).pipe(stream));
    assert.deepEqual(output, [quads[0], quads[2]]);
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].quad, quads[1]);
  });

  it('rejects unknown onInvalid values and validator options', () => {
    assert.throws(() => createValidationStream({ format: 'application/n-quads', version: '1.2', onInvalid: 'warn' }), /Unsupported onInvalid option value: "warn"/);
    assert.throws(() => createValidationStream({ format: 'application/rdf+xml', version: '1.2' }), /Unsupported format/);
  });

  describe('between the N3.js parser and writer', () => {
    it('lets valid data through unchanged', async () => {
      const input = '<http://ex.org/s> <http://ex.org/p> "a"@en .\n';
      const output = await toString(Readable.from([input])
        .pipe(new StreamParser({ format: 'N-Triples' }))
        .pipe(createValidationStream({ format: 'application/n-triples', version: '1.2' }))
        .pipe(new StreamWriter({ format: 'N-Triples' })));
      assert.equal(output, input);
    });

    it('stops TriG data with graphs from being written as Turtle', async () => {
      const input = '<http://ex.org/g> { <http://ex.org/s> <http://ex.org/p> <http://ex.org/o> . }';
      const parser = new StreamParser({ format: 'TriG' });
      const validator = createValidationStream({ format: 'text/turtle', version: '1.2' });
      await assert.rejects(
        pipeline(Readable.from([input]), parser, validator, new StreamWriter({ format: 'Turtle' })),
        /NamedNode cannot be the graph in text\/turtle/);
    });

    it('filters out data that parses but is not valid RDF', async () => {
      // The N3.js parser does not check IRIs or datatype values
      const input = [
        '<http://ex.org/s> <http://ex.org/p> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .',
        '<http://ex.org/s> <http://ex.org/p> "one"^^<http://www.w3.org/2001/XMLSchema#integer> .',
        '<http://ex.org/s> <http://ex.org/p> <http://ex.org/%ZZ> .',
        '',
      ].join('\n');
      const validator = createValidationStream({ format: 'application/n-triples', version: '1.2', onInvalid: 'skip' });
      const invalid = [];
      validator.on('invalid', error => invalid.push(error.message));
      const output = await toString(Readable.from([input])
        .pipe(new StreamParser({ format: 'N-Triples' }))
        .pipe(validator)
        .pipe(new StreamWriter({ format: 'N-Triples' })));
      assert.equal(output,
        '<http://ex.org/s> <http://ex.org/p> "1"^^<http://www.w3.org/2001/XMLSchema#integer> .\n');
      assert.equal(invalid.length, 2);
    });

    it('validates N3 output', async () => {
      const input = '?x <http://ex.org/p> "a" .';
      const output = await toString(Readable.from([input])
        .pipe(new StreamParser({ format: 'N3' }))
        .pipe(createValidationStream({ format: 'text/n3', version: '1.2' }))
        .pipe(new StreamWriter({ format: 'N3' })));
      assert.match(output, /\?x <http:\/\/ex.org\/p> "a"/);
    });
  });
});
