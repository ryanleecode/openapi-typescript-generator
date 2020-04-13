/* eslint-disable no-console */
import { Command, flags as Flags } from '@oclif/command'
import SwaggerParser from '@apidevtools/swagger-parser'
import { OpenAPIV3, OpenAPI } from 'openapi-types'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/pipeable'
import * as O from 'fp-ts/lib/Option'
import { Project, ClassDeclaration, VariableDeclarationKind } from 'ts-morph'
import path from 'path'
import { write } from 'fs'

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
        () => {
          SwaggerParser.validate(flags.input)
          return SwaggerParser.bundle(flags.input)
        },
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

          const doSomethingWithSchema = (
            schema:
              | OpenAPIV3.ReferenceObject
              | OpenAPIV3.ArraySchemaObject
              | OpenAPIV3.NonArraySchemaObject,
            schemaName: string,
            cls?: ClassDeclaration,
          ) => {
            const isReferenceObject = (
              obj: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
            ): obj is OpenAPIV3.ReferenceObject => '$ref' in obj

            const isSchemaObject = (
              obj: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
            ): obj is OpenAPIV3.SchemaObject => 'type' in obj

            if (isReferenceObject(schema)) {
              if (cls) {
                cls.addProperty({
                  name: schemaName,
                  type: 'unknown',
                })
              }
            } else if (isSchemaObject(schema)) {
              switch (schema.type) {
                case 'array':
                  break
                case 'object': {
                  console.log(schemaName, schema)
                  const schemaClass = sourceFile.addClass({
                    name: schemaName,
                  })
                  schemaClass.addJsDocs([
                    {
                      description: schema.description,
                    },
                  ])

                  if (schema.properties) {
                    for (const property of Object.keys(schema.properties!)) {
                      doSomethingWithSchema(
                        schema.properties[property],
                        property,
                        schemaClass,
                      )
                    }
                  }
                  break
                }
                case 'string':
                  if (cls) {
                    cls.addProperty({
                      name: schemaName,
                      type: 'string',
                    })
                  } else {
                    if (!schema.enum) {
                      sourceFile.addTypeAlias({
                        name: schemaName,
                        isExported: true,
                        type: 'string',
                      })
                    } else {
                      const enumVar = sourceFile.addVariableStatement({
                        declarationKind: VariableDeclarationKind.Const,
                        isExported: true,
                        declarations: [
                          {
                            name: schemaName,
                            initializer: (writer) => {
                              writer.block(() => {
                                const enums = schema.enum!
                                enums.forEach((enumValue) => {
                                  writer.write(`${enumValue}:`)
                                  writer.space()
                                  writer.quote()
                                  writer.write(enumValue)
                                  writer.quote()
                                  writer.space()
                                  writer.write('as')
                                  writer.space()
                                  writer.quote()
                                  writer.write(enumValue)
                                  writer.quote()
                                  writer.write(',')
                                  writer.newLineIfLastNot()
                                })
                              })
                            },
                          },
                        ],
                      })

                      sourceFile.addTypeAlias({
                        name: schemaName,
                        isExported: true,
                        type: (writer) => {
                          writer.write('keyof')
                          writer.space()
                          writer.write('typeof')
                          writer.space()
                          writer.write(schemaName)
                        },
                      })
                    }
                  }
                  break
                case 'boolean':
                  if (cls) {
                    cls.addProperty({
                      name: schemaName,
                      type: 'boolean',
                    })
                  } else {
                    sourceFile.addTypeAlias({
                      name: schemaName,
                      type: 'boolean',
                      isExported: true,
                    })
                  }
                  break
                case 'integer':
                  if (cls) {
                    cls.addProperty({
                      name: schemaName,
                      type: 'number',
                    })
                  } else {
                    sourceFile.addTypeAlias({
                      name: schemaName,
                      type: 'number',
                      isExported: true,
                    })
                  }
                  break
                default:
                  break
              }
            }
          }

          const schemas = doc.components?.schemas
          if (schemas) {
            for (const schemaName of Object.keys(schemas)) {
              const schema = schemas[schemaName]

              doSomethingWithSchema(schema, schemaName)
            }
          }

          project.saveSync()
        }),
      ),
    )()
  }
}
