/* eslint-disable no-console */
import { Command, flags as Flags } from '@oclif/command'
import SwaggerParser from '@apidevtools/swagger-parser'
import { OpenAPIV3, OpenAPI } from 'openapi-types'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/pipeable'
import * as O from 'fp-ts/lib/Option'
import { Project } from 'ts-morph'
import path from 'path'

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

  public run(): Promise<any> {
    const { flags } = this.parse(Generate)

    return pipe(
      TE.tryCatch(
        () => SwaggerParser.validate(flags.input),
        (err) => this.error((err as Error).message, { exit: 1 }),
      ),
      TE.map(
        E.fromPredicate(
          O.getRefinement<OpenAPI.Document, OpenAPIV3.Document>((doc) =>
            'openapi' in doc ? O.some(doc as OpenAPIV3.Document) : O.none,
          ),
          () =>
            this.error('input document must use openapi format', { exit: 1 }),
        ),
      ),
      TE.map(
        E.map((doc) => {
          const project = new Project()
          const fs = project.getFileSystem()

          const sourceFile = project.createSourceFile(
            path.join(flags.output, 'file.ts'),
            undefined,
            { overwrite: true },
          )
          /*           sourceFile.addImportDeclaration({
            namespaceImport: 't',
            moduleSpecifier: 'io-ts',
          }) */

          const schemas = doc.components?.schemas
          if (schemas) {
            for (const schemaName of Object.keys(schemas)) {
              const schema = schemas[schemaName]
              console.log(schemaName, schema)

              const schemaClass = sourceFile.addClass({
                name: schemaName,
              })

              const isReferenceObject = (
                obj: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
              ): obj is OpenAPIV3.ReferenceObject => '$ref' in obj

              const isSchemaObject = (
                obj: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
              ): obj is OpenAPIV3.SchemaObject => 'type' in obj

              if (isReferenceObject(schema)) {
                //
              } else if (isSchemaObject(schema)) {
                schemaClass.addJsDocs([
                  {
                    description: schema.description,
                  },
                ])
              }
            }
          }

          project.saveSync()
        }),
      ),
    )()
  }
}
