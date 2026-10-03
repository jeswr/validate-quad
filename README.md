# @rdfjs/validate-quad

Validate [RDF/JS](https://rdf.js.org/data-model-spec/) quads against what an RDF version and a serialization format can represent.

Parsers and serializers such as [N3.js](https://github.com/rdfjs/N3.js) trust the terms they are given, so invalid terms can reach your data or produce documents that don't parse. This package checks quads as a separate pipeline step, so you only pay for validation where you want it.

It checks:

- **term positions:** which term types may be the subject, predicate, object or graph, for the target format (a literal predicate, a named graph in Turtle, or a variable outside N3 is rejected);
- **RDF version:** triple terms (RDF 1.2 only) and directional language-tagged strings (RDF 1.2 and RDF 1.2 Basic);
- **term well-formedness:** absolute RFC 3987 IRIs, blank node labels, BCP 47 language tags, the datatypes of language-tagged strings, valid Unicode in literal values, and literal values against their datatype.

## Install

```sh
npm install @rdfjs/validate-quad
```

The package is written in TypeScript and ships its types. It exports four functions, `assertQuad`, `validateQuad`, `createValidator` and `createValidationStream`, plus the types for their options and results, including the narrowed `ValidQuad<Format, Version>`.

## Usage

### In an N3.js stream pipeline

`createValidationStream` takes the same options as `createValidator` and returns an object-mode stream that passes valid quads through.

```js
import fs from 'node:fs';
import { StreamParser, StreamWriter } from 'n3';
import { createValidationStream } from '@rdfjs/validate-quad';

fs.createReadStream('data.trig')
  .pipe(new StreamParser({ format: 'TriG' }))
  .pipe(createValidationStream({ format: 'text/turtle', version: '1.2' }))   // fails on quads in a named graph
  .pipe(new StreamWriter({ format: 'Turtle' }))
  .pipe(process.stdout);
```

By default an invalid quad fails the stream with a `QuadValidationError`. To drop invalid quads instead, pass `onInvalid: 'skip'` and listen for `invalid` events:

```js
const validator = createValidationStream({ format: 'application/n-triples', version: '1.2', onInvalid: 'skip' });
validator.on('invalid', error => console.warn(error.message));
```

### Asserting a quad, with type narrowing

`assertQuad` throws the `QuadValidationError` for an invalid quad. In TypeScript it is an assertion function, so afterwards the quad's terms are narrowed to what the format and version allow:

```ts
import type * as RDF from '@rdfjs/types';
import { assertQuad } from '@rdfjs/validate-quad';

function write(quad: RDF.Quad) {
  assertQuad(quad, { format: 'text/turtle', version: '1.1' });
  quad.subject;   // RDF.NamedNode | RDF.BlankNode
  quad.predicate; // RDF.NamedNode
  quad.object;    // RDF.NamedNode | RDF.BlankNode | RDF.Literal (without a base direction)
  quad.graph;     // RDF.DefaultGraph
}
```

With `text/n3`, literals and variables are kept in every position and the graph narrows to the default graph or a blank node (a formula). With version `1.2`, objects can also be triple terms (`ValidTriple`), whose own terms narrow the same way and whose graph is the default graph. The narrowed quad type is exported as `ValidQuad<Format, Version>`.

### Validating quads directly

```js
import { createValidator, validateQuad } from '@rdfjs/validate-quad';

// Create a validator once and reuse it for many quads
const validate = createValidator({ format: 'application/n-quads', version: '1.1' });
for (const quad of quads) {
  const error = validate(quad);
  if (error)
    console.warn(error.message, error.position, error.term);
}

// Or validate a single quad
const error = validateQuad(quad, { format: 'text/turtle', version: '1.2' });
```

A validator returns `null` for a valid quad and an `Error` named `QuadValidationError` otherwise. The error has the validated `quad`, the `position` of the offending term (`subject`, `predicate`, `object` or `graph`; inside a triple term, its position there), and the offending `term`. Validators never throw on bad input; only invalid options throw, when the validator is created. `validateQuad` and `assertQuad` reuse validators across calls with the same options.

## Options

| Option | Values | Default |
|---|---|---|
| `format` | Exactly one of `text/turtle`, `application/trig`, `application/n-triples`, `application/n-quads`, `text/n3` | required |
| `version` | `'1.1'`, `'1.2-basic'`, `'1.2'` | required |
| `terms` | `true` (all term checks), `false` (none), or an object selecting `iris`, `blankNodeLabels`, `languageTags` and `datatypes` | `true` |
| `onInvalid` (stream only) | `'error'`, `'skip'` | `'error'` |

A missing `format` or `version`, or any other value, including `null`, a format name such as `Turtle`, or a content type with parameters, throws when the validator is created. So do unknown `terms` and `onInvalid` values.

The positions each format allows:

| Position | `text/turtle`, `application/n-triples` | `application/trig`, `application/n-quads` | `text/n3` |
|---|---|---|---|
| subject | IRI, blank node | IRI, blank node | IRI, blank node, literal, variable, triple term |
| predicate | IRI | IRI | IRI, blank node, literal, variable, triple term |
| object | IRI, blank node, literal, triple term | IRI, blank node, literal, triple term | IRI, blank node, literal, variable, triple term |
| graph | default graph | default graph, IRI, blank node | default graph, blank node (formula) |

Inside a triple term, the graph must be the default graph, and the subject, predicate and object follow the same rules as above (so in RDF 1.2 a triple term can't be the subject of another triple term outside N3).

Position and version checks always run. `terms: false` skips only the well-formedness checks.

## Built on

- [validate-iri](https://github.com/comunica/validate-iri.js) (strict RFC 3987) for IRIs;
- [bcp-47](https://github.com/wooorm/bcp-47) for language tags;
- [rdf-validate-datatype](https://github.com/zazuko/rdf-validate-datatype) for literal values. Its registry decides which datatypes are checked and how strictly, and you can register your own validators there. It checks the shape of dates and times, not their ranges (`2020-13-01` passes as an `xsd:date`).

Blank node labels are checked against the `BLANK_NODE_LABEL` rule shared by Turtle, TriG, N-Triples and N-Quads.

## Performance

On 200,000 mixed quads (Node 22), position and version checks cost about 0.1 µs per quad, and all checks about 1 µs per quad. IRI and language tag results are cached, since data tends to repeat them. `validateQuad` and `assertQuad` add about 0.25 µs per call to look up their cached validator, so prefer `createValidator` in hot loops.

## License

MIT
