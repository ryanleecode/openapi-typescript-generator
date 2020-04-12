/* eslint-disable no-console */
import { Command, flags as Flags } from '@oclif/command'
import SwaggerParser from '@apidevtools/swagger-parser'
import { OpenAPIV3, OpenAPI } from 'openapi-types'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/pipeable'
import * as O from 'fp-ts/lib/Option'

export default class Generate extends Command {
  static description = 'generate code from openapi 3.0 specification'

  static flags = {
    input: Flags.string({
      char: 'i',
      description: 'input openapi file',
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
            (doc as OpenAPIV3.Document).openapi
              ? O.some(doc as OpenAPIV3.Document)
              : O.none,
          ),
          () =>
            this.error('input document must use openapi format', { exit: 1 }),
        ),
      ),
    )()
  }
}
