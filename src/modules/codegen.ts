/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-console */
import { OpenAPIV3 } from 'openapi-types'
import * as E from 'fp-ts/lib/Either'
import * as A from 'fp-ts/lib/Array'
import * as I from 'fp-ts/lib/Identity'
import { pipe } from 'fp-ts/lib/pipeable'
import * as O from 'fp-ts/lib/Option'
import * as gen from '@drdgvhbh/io-ts-codegen'
import * as t from 'io-ts'

export type SchemaObject =
  | OpenAPIV3.ReferenceObject
  | OpenAPIV3.ArraySchemaObject
  | OpenAPIV3.NonArraySchemaObject

export const isArraySchemaObject = O.getRefinement<
  SchemaObject,
  OpenAPIV3.ArraySchemaObject
>((schema) =>
  'items' in schema ? O.some(schema as OpenAPIV3.ArraySchemaObject) : O.none,
)

export const isNonArraySchemaObject = O.getRefinement<
  SchemaObject,
  OpenAPIV3.NonArraySchemaObject
>((schema) =>
  'type' in schema && !isArraySchemaObject(schema)
    ? O.some(schema as OpenAPIV3.NonArraySchemaObject)
    : O.none,
)

export const isReferenceObject = O.getRefinement<
  SchemaObject,
  OpenAPIV3.ReferenceObject
>((schema) =>
  '$ref' in schema ? O.some(schema as OpenAPIV3.ReferenceObject) : O.none,
)

export function handlePropertyObject(schema: SchemaObject, schemaName: string) {
  if (isReferenceObject(schema)) {
    return O.none
  } else if (isArraySchemaObject(schema)) {
    return O.none
  } else if (isNonArraySchemaObject(schema)) {
    switch (schema.type) {
      case 'object':
        return O.none
      case 'boolean':
        return O.some(gen.property(schemaName, gen.booleanType))
      case 'integer':
        return O.some(gen.property(schemaName, gen.integerType))
      case 'null':
        return O.some(gen.property(schemaName, gen.nullType))
      case 'number':
        return O.some(gen.property(schemaName, gen.numberType))
      case 'string':
        return O.some(gen.property(schemaName, gen.stringType))
    }
  }

  return O.none
}

export function handleObjectSchemaObject(
  schema: OpenAPIV3.BaseSchemaObject,
  schemaName: string,
) {
  return pipe(
    schema.properties,
    O.fromNullable,
    O.map((properties) =>
      pipe(
        Object.keys(properties),
        A.map((propertyName) =>
          handlePropertyObject(properties[propertyName], propertyName),
        ),
      ),
    ),
    O.fold(
      () => [],
      (declarations) =>
        pipe(
          declarations,
          A.filter(O.isSome),
          A.map((someDeclaration) => someDeclaration.value),
        ),
    ),
    (declarations) =>
      gen.typeDeclaration(schemaName, gen.typeCombinator(declarations), true),
    O.some,
  )
}

export function handleRootString(
  schema: OpenAPIV3.BaseSchemaObject,
  schemaName: string,
) {
  return pipe(
    schema.enum,
    E.fromNullable(O.some(gen.typeDeclaration(schemaName, gen.stringType))),
    E.chain((enums) =>
      pipe(
        t.array(t.string).decode(enums),
        E.mapLeft(() => O.none as O.Option<gen.TypeDeclaration>),
        E.map((values) =>
          O.some(
            gen.typeDeclaration(schemaName, gen.keyofCombinator(values), true),
          ),
        ),
      ),
    ),
    E.fold(
      (e) => e,
      (a) => a,
    ),
  )
}

export function handleRootSchema(schema: SchemaObject, schemaName: string) {
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
        return handleRootString(schema, schemaName)
    }
  }

  return O.none
}

export function handleSchemas(schemas: Record<string, SchemaObject>) {
  return pipe(Object.keys(schemas), (schemaNames) =>
    A.array.traverse(I.identity)(schemaNames, (schemaName) =>
      pipe(schemas[schemaName], (schema) =>
        handleRootSchema(schema, schemaName),
      ),
    ),
  )
}
export function handleComponents(components: OpenAPIV3.ComponentsObject) {
  return pipe(
    components.schemas,
    E.fromNullable([] as Array<O.Option<gen.TypeDeclaration>>),
    E.map(handleSchemas),
    E.fold(
      (e) => e,
      (a) => a,
    ),
  )
}

export function handleDocument(document: OpenAPIV3.Document) {
  return pipe(
    document.components,
    E.fromNullable([] as Array<O.Option<gen.TypeDeclaration>>),
    E.map(handleComponents),
    E.fold(
      (e) => e,
      (a) => a,
    ),
  )
}
