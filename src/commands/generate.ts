/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-console */
import { Command, flags as Flags } from '@oclif/command'
import SwaggerParser from '@apidevtools/swagger-parser'
import { OpenAPIV3, OpenAPI } from 'openapi-types'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/pipeable'
import * as O from 'fp-ts/lib/Option'
import path from 'path'
import * as gen from '@drdgvhbh/io-ts-codegen'
import fs from 'fs-jetpack'
import ono from 'ono'
import { handleDocument } from '../modules'

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

  public async run(): Promise<unknown> {
    const { flags } = this.parse(Generate)

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
                        `import * as t from 'io-ts'\n\n`,
                      ],
                      ...pipe(
                        sortedDeclarations,
                        A.map((d) => `${gen.printRuntime(d)}\n\n`),
                      ),
                      ...pipe(
                        sortedDeclarations,
                        A.map((d) => {
                          return `export type ${d.name} = t.TypeOf<typeof ${d.name}>\n\n`
                        }),
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
