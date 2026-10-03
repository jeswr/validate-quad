import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DataFactory } from 'n3';
import {
  createValidator, validateQuad,
} from '@rdfjs/validate-quad';

const { namedNode, blankNode, literal, variable, quad, defaultGraph } = DataFactory;
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

const s = namedNode('http://ex.org/s');
const p = namedNode('http://ex.org/p');
const o = namedNode('http://ex.org/o');
const g = namedNode('http://ex.org/g');
const tripleTerm = quad(s, p, o);

const FORMATS = {
  Turtle: ['text/turtle'],
  TriG: ['application/trig'],
  'N-Triples': ['application/n-triples'],
  'N-Quads': ['application/n-quads'],
  N3: ['text/n3'],
};

function isValidationError(error) {
  return error instanceof Error && error.name === 'QuadValidationError';
}

function expectValid(q, options) {
  assert.equal(validateQuad(q, options), null);
}

function expectInvalid(q, options, position, message) {
  const error = validateQuad(q, options);
  assert.ok(isValidationError(error), `expected an error for ${JSON.stringify(options)}`);
  assert.equal(error.quad, q);
  assert.equal(error.position, position);
  if (message)
    assert.match(error.message, message);
  return error;
}

describe('validateQuad', () => {
  describe('with valid quads', () => {
    it('accepts a triple in every format', () => {
      for (const format of [undefined, ...Object.values(FORMATS).flat()])
        expectValid(quad(s, p, o), { format });
    });

    it('accepts blank nodes and literals in valid positions', () => {
      expectValid(quad(blankNode('b0'), p, blankNode('b1')));
      expectValid(quad(s, p, literal('plain')));
      expectValid(quad(s, p, literal('chat', 'fr')));
      expectValid(quad(s, p, literal('5', namedNode(`${XSD}integer`))));
      expectValid(quad(s, p, literal('x', namedNode('http://ex.org/custom'))));
    });

    it('accepts named graphs where the format has graphs', () => {
      for (const format of [undefined, ...FORMATS.TriG, ...FORMATS['N-Quads']]) {
        expectValid(quad(s, p, o, g), { format });
        expectValid(quad(s, p, o, blankNode('g')), { format });
      }
    });

    it('accepts terms from other libraries', () => {
      const foreign = {
        subject: { termType: 'NamedNode', value: 'http://ex.org/s' },
        predicate: { termType: 'NamedNode', value: 'http://ex.org/p' },
        object: {
          termType: 'Literal', value: '1', language: '', direction: '',
          datatype: { termType: 'NamedNode', value: `${XSD}integer` },
        },
        graph: { termType: 'DefaultGraph', value: '' },
      };
      expectValid(foreign, { format: 'application/n-quads' });
      foreign.object.value = 'one';
      expectInvalid(foreign, { format: 'application/n-quads' }, 'object', /not valid for datatype/);
    });
  });

  describe('term positions', () => {
    for (const [name, formats] of Object.entries(FORMATS).filter(([name]) => name !== 'N3')) {
      describe(`in ${name}`, () => {
        it('rejects literal, variable, triple term and default graph subjects', () => {
          for (const format of formats) {
            expectInvalid(quad(literal('a'), p, o), { format }, 'subject', /Literal cannot be the subject/);
            expectInvalid(quad(variable('x'), p, o), { format }, 'subject', /Variable cannot be the subject/);
            expectInvalid(quad(tripleTerm, p, o), { format }, 'subject', /Quad cannot be the subject/);
            expectInvalid(quad(defaultGraph(), p, o), { format }, 'subject', /DefaultGraph cannot be the subject/);
          }
        });

        it('rejects non-IRI predicates', () => {
          for (const format of formats) {
            expectInvalid(quad(s, blankNode('b'), o), { format }, 'predicate', /BlankNode cannot be the predicate/);
            expectInvalid(quad(s, literal('a'), o), { format }, 'predicate', /Literal cannot be the predicate/);
            expectInvalid(quad(s, variable('x'), o), { format }, 'predicate');
            expectInvalid(quad(s, tripleTerm, o), { format }, 'predicate');
          }
        });

        it('rejects variable and default graph objects', () => {
          for (const format of formats) {
            expectInvalid(quad(s, p, variable('x')), { format }, 'object', /Variable cannot be the object/);
            expectInvalid(quad(s, p, defaultGraph()), { format }, 'object');
          }
        });

        it('rejects literal, triple term and variable graphs', () => {
          for (const format of formats) {
            expectInvalid(quad(s, p, o, literal('g')), { format }, 'graph');
            expectInvalid(quad(s, p, o, tripleTerm), { format }, 'graph');
            expectInvalid(quad(s, p, o, variable('g')), { format }, 'graph');
          }
        });
      });
    }

    it('rejects named graphs in formats without graphs', () => {
      for (const format of [...FORMATS.Turtle, ...FORMATS['N-Triples'], ...FORMATS.N3]) {
        expectInvalid(quad(s, p, o, g), { format }, 'graph', /NamedNode cannot be the graph in /);
      }
      expectInvalid(quad(s, p, o, blankNode('g')), { format: 'text/turtle' }, 'graph', /in text\/turtle$/);
    });

    it('describes an abstract dataset when no format is given', () => {
      expectInvalid(quad(s, literal('a'), o), {}, 'predicate', /in an RDF dataset$/);
    });

    describe('in N3', () => {
      it('accepts literals, blank nodes, variables and triple terms everywhere', () => {
        for (const format of FORMATS.N3) {
          expectValid(quad(literal('a'), literal('b'), literal('c')), { format });
          expectValid(quad(variable('x'), variable('y'), variable('z')), { format });
          expectValid(quad(blankNode('a'), blankNode('b'), blankNode('c')), { format });
          expectValid(quad(tripleTerm, p, tripleTerm), { format });
        }
      });

      it('accepts formulas as blank node graphs', () => {
        expectValid(quad(s, p, o, blankNode('f')), { format: 'text/n3' });
      });

      it('rejects default graph terms outside the graph position', () => {
        expectInvalid(quad(s, defaultGraph(), o), { format: 'text/n3' }, 'predicate');
      });
    });
  });

  describe('triple terms', () => {
    it('are accepted as objects in RDF 1.2', () => {
      expectValid(quad(s, p, tripleTerm));
      expectValid(quad(s, p, quad(s, p, quad(s, p, literal('deep')))), { format: 'text/turtle' });
    });

    it('are rejected in RDF 1.1 and RDF 1.2 Basic', () => {
      expectInvalid(quad(s, p, tripleTerm), { version: '1.1' }, 'object', /triple terms are not part of RDF 1.1/);
      expectInvalid(quad(s, p, tripleTerm), { version: '1.2-basic' }, 'object', /RDF 1.2-basic/);
      expectInvalid(quad(tripleTerm, p, o), { format: 'text/n3', version: '1.1' }, 'subject');
    });

    it('must not have a named graph', () => {
      const error = expectInvalid(quad(s, p, quad(s, p, o, g)), {}, 'graph', /in a triple term/);
      assert.equal(error.term, g);
    });

    it('must have valid nested positions', () => {
      expectInvalid(quad(s, p, quad(literal('a'), p, o)), {}, 'subject', /in a triple term/);
      expectInvalid(quad(s, p, quad(tripleTerm, p, o)), {}, 'subject');
      expectInvalid(quad(s, p, quad(s, blankNode('b'), o)), {}, 'predicate');
      expectInvalid(quad(s, p, quad(s, p, namedNode('not an iri'))), {}, 'object', /RFC 3987/);
    });
  });

  describe('term well-formedness', () => {
    it('rejects relative and malformed IRIs', () => {
      expectInvalid(quad(namedNode('relative'), p, o), {}, 'subject', /absolute IRI/);
      expectInvalid(quad(s, namedNode('http://ex.org/a b'), o), {}, 'predicate');
      expectInvalid(quad(s, p, namedNode('http://ex.org/<x>')), {}, 'object');
      expectInvalid(quad(s, p, o, namedNode('')), {}, 'graph');
    });

    it('rejects malformed datatype IRIs', () => {
      expectInvalid(quad(s, p, literal('x', namedNode('custom'))), {}, 'object', /datatype is not an absolute IRI/);
    });

    it('rejects invalid blank node labels', () => {
      expectInvalid(quad(blankNode('a b'), p, o), {}, 'subject', /blank node label/);
      expectInvalid(quad(s, p, blankNode('-a')), {}, 'object');
      expectInvalid(quad(s, p, blankNode('a.')), {}, 'object');
    });

    it('rejects malformed language tags', () => {
      expectInvalid(quad(s, p, literal('x', 'en us')), {}, 'object', /language tag "en us"/);
      expectInvalid(quad(s, p, literal('x', 'abcdefghi')), {}, 'object');
    });

    it('checks the datatypes of language-tagged strings', () => {
      const literalOf = (language, direction, datatype) => ({
        termType: 'Literal', value: 'x', language, direction, datatype: namedNode(datatype),
      });
      expectValid(quad(s, p, literalOf('en', '', `${RDF}langString`)));
      expectValid(quad(s, p, literalOf('en', 'rtl', `${RDF}dirLangString`)));
      expectInvalid(quad(s, p, literalOf('en', '', `${XSD}string`)), {}, 'object', /langString/);
      expectInvalid(quad(s, p, literalOf('en', 'ltr', `${RDF}langString`)), {}, 'object', /dirLangString/);
      expectInvalid(quad(s, p, literalOf('', '', `${RDF}langString`)), {}, 'object', /no language tag/);
      expectInvalid(quad(s, p, literalOf('', 'ltr', `${RDF}dirLangString`)), {}, 'object', /no language tag/);
      expectInvalid(quad(s, p, literalOf('en', 'up', `${RDF}dirLangString`)), {}, 'object', /not ltr or rtl/);
    });

    it('rejects literals without a named node datatype', () => {
      expectInvalid(quad(s, p, { termType: 'Literal', value: 'x', language: '' }), {}, 'object', /datatype/);
    });

    it('accepts directional strings in RDF 1.2 only', () => {
      const directional = literal('x', { language: 'en', direction: 'ltr' });
      expectValid(quad(s, p, directional));
      expectValid(quad(s, p, directional), { version: '1.2-basic' });
      expectInvalid(quad(s, p, directional), { version: '1.1' }, 'object', /not part of RDF 1.1/);
    });

    it('rejects values outside the lexical space of their datatype', () => {
      expectInvalid(quad(s, p, literal('abc', namedNode(`${XSD}integer`))), {}, 'object', /xsd|XMLSchema#integer/);
      expectInvalid(quad(s, p, literal('maybe', namedNode(`${XSD}boolean`))), {}, 'object');
      expectInvalid(quad(s, p, literal('tomorrow', namedNode(`${XSD}date`))), {}, 'object');
    });

    it('rejects literal values that are not valid Unicode', () => {
      expectInvalid(quad(s, p, literal('a\uD800b')), {}, 'object', /Unicode/);
    });

    it('skips all term checks with terms: false', () => {
      const options = { terms: false };
      expectValid(quad(namedNode('relative'), p, blankNode('a b')), options);
      expectValid(quad(s, p, literal('abc', namedNode(`${XSD}integer`))), options);
      expectValid(quad(s, p, literal('x', 'en us')), options);
      // Position and version checks still apply
      expectInvalid(quad(s, literal('a'), o), options, 'predicate');
      expectInvalid(quad(s, p, tripleTerm), { ...options, version: '1.1' }, 'object');
    });

    it('runs only the selected term checks', () => {
      const options = { terms: { iris: true } };
      expectInvalid(quad(namedNode('relative'), p, o), options, 'subject');
      expectValid(quad(blankNode('a b'), p, o), options);
      expectValid(quad(s, p, literal('abc', namedNode(`${XSD}integer`))), options);
      expectValid(quad(s, p, literal('x', 'en us')), options);
      expectInvalid(quad(blankNode('a b'), p, o), { terms: { blankNodeLabels: true } }, 'subject');
      expectInvalid(quad(s, p, literal('x', 'en us')), { terms: { languageTags: true } }, 'object');
      expectInvalid(quad(s, p, literal('a', namedNode(`${XSD}integer`))), { terms: { datatypes: true } }, 'object');
      expectValid(quad(namedNode('relative'), p, o), { terms: {} });
    });
  });

  describe('malformed input', () => {
    it('rejects missing terms', () => {
      expectInvalid({ subject: s, predicate: p, object: o }, {}, 'graph', /graph is missing/);
      expectInvalid({ subject: s, object: o, graph: defaultGraph() }, {}, 'predicate', /predicate is missing/);
    });

    it('rejects non-objects', () => {
      const error = validateQuad(null);
      assert.ok(isValidationError(error));
      assert.equal(error.position, null);
      assert.match(validateQuad('quad').message, /Expected a quad/);
    });

    it('rejects unknown term types', () => {
      expectInvalid(quad(s, p, { termType: 'Formula', value: '' }), {}, 'object', /Formula cannot be the object/);
    });
  });

  describe('options', () => {
    it('accepts exactly the supported content types', () => {
      for (const format of Object.values(FORMATS).flat())
        assert.equal(typeof createValidator({ format }), 'function');
    });

    it('rejects anything else as a format', () => {
      for (const format of ['Turtle', 'TriG', 'N-Triples', 'N-Quads', 'N3', 'turtle', 'text/turtle*',
        'TEXT/TURTLE', 'text/turtle; charset=utf-8', ' text/turtle', 'application/rdf+xml',
        'application/ld+json', '', null, 3, {}, 'toString'])
        assert.throws(() => createValidator({ format }), /^Error: Unsupported format: .*; expected one of text\/turtle, application\/trig, application\/n-triples, application\/n-quads, text\/n3$/, String(format));
    });

    it('accepts exactly the supported versions', () => {
      for (const version of ['1.1', '1.2-basic', '1.2'])
        assert.equal(typeof createValidator({ version }), 'function');
    });

    it('rejects anything else as a version', () => {
      for (const version of ['1.0', '1.3', '1.2-Basic', '1.2-full', '1.2 ', 'RDF 1.2', '', null, 1.1, 1.2, {}])
        assert.throws(() => createValidator({ version }), /^Error: Unsupported RDF version: .*; expected one of 1\.1, 1\.2-basic, 1\.2$/, String(version));
    });

    it('rejects invalid term options', () => {
      assert.throws(() => createValidator({ terms: 'yes' }), TypeError);
      assert.throws(() => createValidator({ terms: null }), TypeError);
    });

    it('returns a reusable validator', () => {
      const validate = createValidator({ format: 'text/turtle' });
      assert.equal(validate(quad(s, p, o)), null);
      assert.ok(isValidationError(validate(quad(s, p, o, g))));
      assert.equal(validate(quad(s, p, o)), null);
    });
  });

  describe('term well-formedness details', () => {
    const literalOf = value => quad(s, p, literal('x', value));

    it('checks IRIs as per RFC 3987, caching results across many values', () => {
      expectValid(quad(namedNode('urn:isbn:0451450523'), p, o));
      for (let i = 0; i < 10050; i++)
        expectValid(quad(namedNode(`http://ex.org/${i}`), p, o));
      expectValid(quad(namedNode('http://ex.org/0'), p, o));
      expectInvalid(quad(namedNode('a'), p, o), {}, 'subject');
    });

    it('checks language tags as per BCP 47', () => {
      for (const tag of ['en', 'en-US', 'EN-us', 'zh-Hant-TW', 'de-1996', 'x-private', 'i-klingon', 'en-GB-oed', 'sgn-BE-FR'])
        expectValid(literalOf(tag));
      for (const tag of ['en us', 'abcdefghi', 'en-', '1en', 'x', 'x-'])
        expectInvalid(literalOf(tag), {}, 'object', /language tag/);
    });

    it('checks blank node labels', () => {
      for (const label of ['b0', '0', 'a.b', 'a-b', '_x', 'é'])
        expectValid(quad(blankNode(label), p, o));
      for (const label of ['', 'a b', '-a', 'a.', '.a', 'a:b'])
        expectInvalid(quad({ termType: 'BlankNode', value: label }, p, o), {}, 'subject', /blank node label/);
    });

    it('checks literal values for known datatypes only', () => {
      expectValid(quad(s, p, literal('12', namedNode(`${XSD}integer`))));
      expectInvalid(quad(s, p, literal('1.5', namedNode(`${XSD}integer`))), {}, 'object');
      expectValid(quad(s, p, literal('anything', namedNode('http://ex.org/unknown'))));
    });
  });
});
