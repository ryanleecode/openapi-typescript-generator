/* eslint-disable no-console */
import { Command, flags as Flags } from '@oclif/command'
import SwaggerParser from '@apidevtools/swagger-parser'
import { OpenAPIV3, OpenAPI } from 'openapi-types'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as B from 'fp-ts/lib/boolean'
import * as A from 'fp-ts/lib/Array'
import * as I from 'fp-ts/lib/Identity'
import { pipe } from 'fp-ts/lib/pipeable'
import * as O from 'fp-ts/lib/Option'
import { Project, ClassDeclaration, VariableDeclarationKind } from 'ts-morph'
import path from 'path'
import yallist from 'yallist'
import * as gen from 'io-ts-codegen'
import fs from 'fs-jetpack'
import ono from 'ono'
import { sequenceT } from 'fp-ts/lib/Apply'

export default class Generate extends Command {
  static description = 'generate code from openapi 3.0 specification'

  static flags = {
    input: Flags.string({
      char: 'i',
      description: 'input openapi file',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'output directory',
      required: true,
    }),
  }

  public async run(): Promise<any> {
    const { flags } = this.parse(Generate)

    // const schemas: Record<string, > = {}
    const ll = new yallist()

    // list of type declarations
    const declarations = [
      gen.typeDeclaration(
        'Persons',
        gen.arrayCombinator(gen.identifier('Person')),
      ),
      gen.typeDeclaration(
        'Person',
        gen.typeCombinator([
          gen.property('name', gen.stringType),
          gen.property('age', gen.numberType),
        ]),
      ),
    ]

    const sorted = gen.sort(declarations)

    console.log(sorted.map((d) => gen.printRuntime(d)).join('\n'))
    console.log(sorted.map((d) => gen.printStatic(d)).join('\n'))

    // apply topological sort in order to get the right order

    type SchemaObject =
      | OpenAPIV3.ReferenceObject
      | OpenAPIV3.ArraySchemaObject
      | OpenAPIV3.NonArraySchemaObject

    const isArraySchemaObject = O.getRefinement<
      SchemaObject,
      OpenAPIV3.ArraySchemaObject
    >((schema) =>
      'items' in schema
        ? O.some(schema as OpenAPIV3.ArraySchemaObject)
        : O.none,
    )

    const isNonArraySchemaObject = O.getRefinement<
      SchemaObject,
      OpenAPIV3.NonArraySchemaObject
    >((schema) =>
      'type' in schema && !isArraySchemaObject(schema)
        ? O.some(schema as OpenAPIV3.NonArraySchemaObject)
        : O.none,
    )

    const isReferenceObject = O.getRefinement<
      SchemaObject,
      OpenAPIV3.ReferenceObject
    >((schema) =>
      '$ref' in schema ? O.some(schema as OpenAPIV3.ReferenceObject) : O.none,
    )

    const handleObjectSchemaObject = (
      schema: OpenAPIV3.BaseSchemaObject,
      schemaName: string,
    ) => {
      const declaration = gen.typeDeclaration(
        schemaName,
        gen.typeCombinator([]),
        true,
      )

      return O.some(declaration)
    }

    const handleRootString = (
      schema: OpenAPIV3.BaseSchemaObject,
      schemaName: string,
    ) => {
      // switch (schema.en)
      return O.some(gen.typeDeclaration(schemaName, gen.stringType))
    }

    const handleRootSchema = (schema: SchemaObject, schemaName: string) => {
      if (isReferenceObject(schema)) {
        return O.none
      } else if (isArraySchemaObject(schema)) {
        return O.none
      } else if (isNonArraySchemaObject(schema)) {
        switch (schema.type) {
          case 'object':
            return handleObjectSchemaObject(schema, schemaName)
          case 'boolean':
            return O.some(gen.typeDeclaration(schemaName, gen.booleanType))
          case 'integer':
            return O.some(gen.typeDeclaration(schemaName, gen.integerType))
          case 'null':
            return O.some(gen.typeDeclaration(schemaName, gen.nullType))
          case 'number':
            return O.some(gen.typeDeclaration(schemaName, gen.numberType))
          case 'string':
            return O.some(gen.typeDeclaration(schemaName, gen.stringType))
        }
      }

      return O.none
    }

    const handleSchemas = (schemas: Record<string, SchemaObject>) =>
      pipe(Object.keys(schemas), (schemaNames) =>
        A.array.traverse(I.identity)(schemaNames, (schemaName) =>
          pipe(schemas[schemaName], (schema) =>
            handleRootSchema(schema, schemaName),
          ),
        ),
      )

    const handleComponents = (components: OpenAPIV3.ComponentsObject) =>
      pipe(
        components.schemas,
        E.fromNullable([] as Array<O.Option<gen.TypeDeclaration>>),
        E.map(handleSchemas),
        E.fold(
          (e) => e,
          (a) => a,
        ),
      )

    const handleDocument = (document: OpenAPIV3.Document) =>
      pipe(
        document.components,
        E.fromNullable([] as Array<O.Option<gen.TypeDeclaration>>),
        E.map(handleComponents),
        E.fold(
          (e) => e,
          (a) => a,
        ),
      )

    return pipe(
      TE.tryCatch(
        () => SwaggerParser.bundle(flags.input),
        (err) => this.error((err as Error).message, { exit: 1 }),
      ),
      TE.map(
        pipe(
          E.fromPredicate(
            O.getRefinement<OpenAPI.Document, OpenAPIV3.Document>((doc) =>
              'openapi' in doc ? O.some(doc as OpenAPIV3.Document) : O.none,
            ),
            () =>
              this.error('input document must use openapi format', { exit: 1 }),
          ),
        ),
      ),
      TE.chain(TE.fromEither),
      TE.map(handleDocument),
      TE.chainFirst((declarations) =>
        TE.tryCatch(
          () =>
            pipe([path.join(flags.output, 'file.ts')], ([outputPath]) =>
              fs.writeAsync(
                outputPath,
                pipe(
                  A.filter(O.isSome)(declarations),
                  A.map((o) => o.value),
                  gen.sort,
                  (sortedDeclarations) =>
                    [
                      ...[
                        `/* eslint-disable */\n`,
                        `import * as t from 'io-ts'\n`,
                      ],
                      ...pipe(
                        sortedDeclarations,
                        A.map((d) => `${gen.printRuntime(d)}\n`),
                      ),
                      ...pipe(
                        sortedDeclarations,
                        A.map((d) => `${gen.printStatic(d)}\n`),
                      ),
                    ].join(''),
                ),
              ),
            ),
          (error) =>
            pipe('failed to save project', (msg) =>
              typeof error === 'object' && error
                ? ono(error, msg)
                : ono.error({ error }, msg),
            ),
        ),
      ),
    )()
  }
}
